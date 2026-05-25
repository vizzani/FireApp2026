// FireApp — Edge Function: send-push-notifications
// Inviata ogni mattina da pg_cron, oppure manualmente
// Deploy: supabase functions deploy send-push-notifications

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Firma VAPID manuale senza dipendenze npm esterne
async function buildVapidAuthHeader(audience: string, subject: string, publicKey: string, privateKey: string) {
  const header  = btoa(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const now     = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: subject })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const sigInput = new TextEncoder().encode(`${header}.${payload}`);
  const keyData  = Uint8Array.from(atob(privateKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'ECDH', namedCurve: 'P-256' }, false, []
  ).catch(async () => {
    // Fallback: try pkcs8 format
    return crypto.subtle.importKey('pkcs8', keyData, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  });

  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, sigInput);
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `vapid t=${header}.${payload}.${sigB64},k=${publicKey}`;
}

async function sendWebPush(subscription: { endpoint: string; p256dh: string; auth_key: string }, payload: object) {
  const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
  const vapidEmail   = Deno.env.get('VAPID_EMAIL') ?? 'mailto:admin@fireapp.it';

  const url      = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const authHeader = await buildVapidAuthHeader(audience, vapidEmail, vapidPublic, vapidPrivate);

  const body = new TextEncoder().encode(JSON.stringify(payload));

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization':  authHeader,
      'Content-Type':   'application/json',
      'Content-Length': body.length.toString(),
      'TTL': '86400',
    },
    body,
  });

  return res.ok;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const EQ_LABELS: Record<string, string> = {
      estintori: 'Estintori', idranti: 'Idranti', irai: 'IRAI',
      evac: 'EVAC', sprinkler: 'Sprinkler', porte_rei: 'Porte REI',
    };

    // 1. Scadenze nei prossimi 7 giorni
    const { data: deadlines } = await supabase
      .rpc('get_upcoming_deadlines', { p_days: 7 });

    if (!deadlines?.length) {
      return new Response(JSON.stringify({ sent: 0, message: 'Nessuna scadenza imminente' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Raggruppa per org
    const byOrg: Record<string, typeof deadlines> = {};
    for (const d of deadlines) {
      if (!byOrg[d.org_id]) byOrg[d.org_id] = [];
      byOrg[d.org_id].push(d);
    }

    let totalSent = 0;

    // 3. Per ogni org, invia push a tutti gli utenti iscritti
    for (const [orgId, items] of Object.entries(byOrg)) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth_key')
        .eq('org_id', orgId);

      if (!subs?.length) continue;

      // Costruisce messaggio
      const count = items.length;
      const first = items[0];
      const eqLabel = EQ_LABELS[first.equipment_type] || first.equipment_type;
      const body = count === 1
        ? `${first.client_name} — ${eqLabel} scade tra ${first.days_left} giorni`
        : `${count} scadenze in arrivo nei prossimi 7 giorni`;

      const payload = {
        title: '🔔 FireApp — Scadenze imminenti',
        body,
        url: '/?screen=scadenzario',
        tag: `scadenze-${orgId}-${new Date().toISOString().split('T')[0]}`,
      };

      for (const sub of subs) {
        const ok = await sendWebPush(sub, payload);
        if (ok) totalSent++;
      }
    }

    return new Response(JSON.stringify({ sent: totalSent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Push error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
