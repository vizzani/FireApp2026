// FireApp Service Worker v3 — Offline data caching + Push notifications
const CACHE_NAME    = 'fireapp-v3';
const API_CACHE     = 'fireapp-api-v1';

// ─── STATIC ASSETS ────────────────────────────────────────────────────────────
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// ─── CACHED API PATHS (Supabase REST GET only) ───────────────────────────────
const CACHED_API_PATHS = [
  '/rest/v1/clients',
  '/rest/v1/equipment',
  '/rest/v1/interventions',
  '/rest/v1/schedules',
  '/rest/v1/anomalies',
  '/rest/v1/profiles',
  '/rest/v1/organizations',
  '/rest/v1/checklist_responses',
];

// IndexedDB name / store for the pending-sync queue
const SYNC_DB_NAME  = 'fireapp-sync-queue';
const SYNC_DB_STORE = 'pending-ops';

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/** Return true if the URL path matches one of the cached API paths */
function isCachedApiPath(pathname) {
  return CACHED_API_PATHS.some(p => pathname.startsWith(p));
}

/** Return true if the request is a Supabase REST read (GET + no PostgREST write headers) */
function isSupabaseRead(request) {
  if (request.method !== 'GET') return false;
  // PostgREST signals a mutation with Prefer: resolution=merge-diff etc.
  const prefer = request.headers.get('Prefer') || '';
  if (/resolution=|return=representation/.test(prefer)) return false;
  return true;
}

/** Return true if the request is a Supabase write (POST / PATCH / DELETE) */
function isSupabaseWrite(request) {
  return ['POST', 'PATCH', 'DELETE'].includes(request.method);
}

// ─── INDEXEDDB: PENDING-SYNC QUEUE ────────────────────────────────────────────

function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SYNC_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SYNC_DB_STORE)) {
        db.createObjectStore(SYNC_DB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

/** Enqueue a failed write operation for later replay */
async function enqueuePendingOp(request, body) {
  const entry = {
    url:       request.url,
    method:    request.method,
    headers:   Object.fromEntries(request.headers.entries()),
    body,
    timestamp: Date.now(),
  };
  const db    = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(SYNC_DB_STORE, 'readwrite');
    tx.objectStore(SYNC_DB_STORE).add(entry);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

/** Return all pending ops (for background-sync or manual retry) */
async function getAllPendingOps() {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(SYNC_DB_STORE, 'readonly');
    const req = tx.objectStore(SYNC_DB_STORE).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror   = () => { db.close(); reject(req.error); };
  });
}

/** Delete a single pending op by id */
async function deletePendingOp(id) {
  const db = await openSyncDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(SYNC_DB_STORE, 'readwrite');
    tx.objectStore(SYNC_DB_STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror    = () => { db.close(); reject(tx.error); };
  });
}

/** Replay all queued write operations against the network */
async function replayPendingOps() {
  const ops = await getAllPendingOps();
  for (const op of ops) {
    try {
      const res = await fetch(new Request(op.url, {
        method:  op.method,
        headers: op.headers,
        body:    op.body || undefined,
      }));
      if (res.ok) await deletePendingOp(op.id);
    } catch (_) {
      // Still offline — leave in queue for next sync event
      break;
    }
  }
}

// ─── INSTALL ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      cache.addAll(STATIC_ASSETS).catch(err => console.warn('[SW] Pre-cache parziale:', err))
    )
  );
  self.skipWaiting();
});

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== API_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── FETCH ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // ── Supabase API requests ────────────────────────────────────────────────
  if (url.hostname.endsWith('.supabase.co')) {

    // WRITE (POST / PATCH / DELETE) → queue + forward to network
    if (isSupabaseWrite(event.request)) {
      event.respondWith(
        (async () => {
          try {
            return await fetch(event.request);
          } catch (_) {
            // Offline — save to sync queue so we can retry later
            let body = null;
            try { body = await event.request.clone().text(); } catch (_) { /* no body */ }
            await enqueuePendingOp(event.request, body);
            // Attempt background sync if available
            if ('SyncManager' in self) {
              const reg = await self.registration;
              await reg.sync.register('sync-pending-writes');
            }
            return new Response(
              JSON.stringify({ error: 'Offline — operazione in coda per la sincronizzazione.' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          }
        })()
      );
      return;
    }

    // READ (GET) for cacheable endpoints → stale-while-revalidate
    if (isSupabaseRead(event.request) && isCachedApiPath(url.pathname)) {
      event.respondWith(
        (async () => {
          const cache   = await caches.open(API_CACHE);
          const cached  = await cache.match(event.request);
          const network = fetch(event.request).then(async res => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          }).catch(() => cached);

          // Return cached immediately if available; otherwise wait for network
          return cached || network;
        })()
      );
      return;
    }

    // Other Supabase calls (auth, realtime, non-cached endpoints) → network first
    event.respondWith(
      fetch(event.request).catch(() => new Response(
        JSON.stringify({ error: 'Offline' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      ))
    );
    return;
  }

  // ── Google Fonts ─────────────────────────────────────────────────────────
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then(async cache => {
        const cached = await cache.match(event.request);
        const networkFetch = fetch(event.request).then(res => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // ── Navigation requests → app shell fallback ─────────────────────────────
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // ── Everything else: cache-first for static assets ───────────────────────
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      });
    })
  );
});

// ─── PUSH: riceve notifiche dal server ────────────────────────────────────────
self.addEventListener('push', event => {
  let payload = { title: 'FireApp', body: 'Hai scadenze in arrivo.', url: '/?screen=scadenzario' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body:    payload.body,
      icon:    '/icon-192.png',
      badge:   '/icon-192.png',
      tag:     payload.tag || 'fireapp-scadenza',
      data:    { url: payload.url || '/' },
      actions: [
        { action: 'open',    title: 'Apri scadenzario' },
        { action: 'dismiss', title: 'Ignora' },
      ],
      requireInteraction: false,
    })
  );
});

// ─── NOTIFICATION CLICK ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus().then(c => c.navigate(targetUrl));
      return clients.openWindow(targetUrl);
    })
  );
});

// ─── BACKGROUND SYNC ─────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-checklist' || event.tag === 'sync-pending-writes') {
    event.waitUntil(replayPendingOps());
  }
});
