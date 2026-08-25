/* FireApp — tests.js — Browser test suite (no dependencies) */

(function () {
  'use strict';

  // ─── MINI TEST FRAMEWORK ──────────────────────────────────────────────────────
  let _results = [];
  let _currentDescribe = '';

  function describe(name, fn) {
    _currentDescribe = name;
    fn();
    _currentDescribe = '';
  }

  function test(name, fn) {
    _results.push({ describe: _currentDescribe, name, fn, status: 'pending', detail: '' });
  }

  // ─── ASSERTIONS ───────────────────────────────────────────────────────────────
  const assert = {
    ok(val, msg) {
      if (!val) throw new Error(msg || 'Expected truthy, got ' + val);
    },
    equal(actual, expected, msg) {
      if (actual !== expected)
        throw new Error(msg || 'Expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    },
    deepEqual(actual, expected, msg) {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(msg || 'Deep equal failed: ' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected));
    },
    throws(fn, msg) {
      let threw = false;
      try { fn(); } catch (e) { threw = true; }
      if (!threw) throw new Error(msg || 'Expected function to throw');
    },
    type(val, type, msg) {
      if (typeof val !== type)
        throw new Error(msg || 'Expected typeof ' + type + ', got ' + typeof val);
    },
    isArray(val, msg) {
      if (!Array.isArray(val))
        throw new Error(msg || 'Expected array, got ' + typeof val);
    },
    has(obj, key, msg) {
      if (!(key in obj))
        throw new Error(msg || 'Expected object to have key "' + key + '"');
    },
    matches(str, regex, msg) {
      if (!regex.test(str))
        throw new Error(msg || 'Expected "' + str + '" to match ' + regex);
    },
    gt(a, b, msg) {
      if (!(a > b)) throw new Error(msg || 'Expected ' + a + ' > ' + b);
    },
    gte(a, b, msg) {
      if (!(a >= b)) throw new Error(msg || 'Expected ' + a + ' >= ' + b);
    },
    null(val, msg) {
      if (val !== null && val !== undefined)
        throw new Error(msg || 'Expected null/undefined, got ' + JSON.stringify(val));
    },
    notNull(val, msg) {
      if (val === null || val === undefined)
        throw new Error(msg || 'Expected non-null value');
    },
  };

  // ─── HELPER: check if user is authenticated ───────────────────────────────────
  function isAuthenticated() {
    return !!(window.state && window.state.user && window.state.profile);
  }

  function requireLogin(testObj) {
    if (!isAuthenticated()) {
      testObj.status = 'skipped';
      testObj.detail = 'Requires authenticated session';
      return false;
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── A) CONFIG TESTS ──────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Config', function () {
    test('SUPABASE_URL is defined', function () {
      assert.notNull(window.SUPABASE_URL, 'SUPABASE_URL is not defined');
    });

    test('SUPABASE_URL is a valid HTTPS URL', function () {
      assert.matches(window.SUPABASE_URL, /^https:\/\/.+\.supabase\.co$/, 'SUPABASE_URL format invalid');
    });

    test('SUPABASE_ANON_KEY is defined', function () {
      assert.notNull(window.SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY is not defined');
    });

    test('SUPABASE_ANON_KEY looks like a JWT (three base64 segments)', function () {
      const parts = window.SUPABASE_ANON_KEY.split('.');
      assert.equal(parts.length, 3, 'JWT should have 3 segments, got ' + parts.length);
    });

    test('SUPABASE_ANON_KEY is at least 100 chars', function () {
      assert.gte(window.SUPABASE_ANON_KEY.length, 100);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── B) CHECKLIST TESTS ───────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Checklists', function () {
    const REQUIRED_TYPES = ['estintori', 'idranti', 'irai', 'evac', 'sprinkler', 'porte_rei', 'p1_irai'];

    test('CHECKLISTS is defined and is an object', function () {
      assert.notNull(window.CHECKLISTS);
      assert.type(window.CHECKLISTS, 'object');
    });

    test('CHECKLISTS has all 7 equipment types', function () {
      REQUIRED_TYPES.forEach(function (t) {
        assert.has(window.CHECKLISTS, t, 'Missing checklist type: ' + t);
      });
    });

    test('CHECKLISTS has no unexpected extra types', function () {
      const keys = Object.keys(window.CHECKLISTS);
      assert.equal(keys.length, 7, 'Expected 7 types, got ' + keys.length + ': ' + keys.join(', '));
    });

    test('Each checklist type is a non-empty array', function () {
      REQUIRED_TYPES.forEach(function (t) {
        assert.isArray(window.CHECKLISTS[t], t + ' is not an array');
        assert.gt(window.CHECKLISTS[t].length, 0, t + ' is empty');
      });
    });

    test('Each checklist item has id, desc, norm, freq', function () {
      const requiredFields = ['id', 'desc', 'norm', 'freq'];
      REQUIRED_TYPES.forEach(function (t) {
        window.CHECKLISTS[t].forEach(function (item, i) {
          requiredFields.forEach(function (f) {
            assert.has(item, f, t + '[' + i + '] missing "' + f + '"');
          });
        });
      });
    });

    test('Checklist item IDs are unique across all types', function () {
      var allIds = [];
      REQUIRED_TYPES.forEach(function (t) {
        window.CHECKLISTS[t].forEach(function (item) { allIds.push(item.id); });
      });
      var unique = new Set(allIds);
      assert.equal(unique.size, allIds.length, 'Duplicate IDs found: ' + allIds.filter(function (id, i) { return allIds.indexOf(id) !== i; }).join(', '));
    });

    test('estintori has 8 items', function () {
      assert.equal(window.CHECKLISTS.estintori.length, 8);
    });

    test('idranti has 6 items', function () {
      assert.equal(window.CHECKLISTS.idranti.length, 6);
    });

    test('irai has 8 items', function () {
      assert.equal(window.CHECKLISTS.irai.length, 8);
    });

    test('evac has 11 items', function () {
      assert.equal(window.CHECKLISTS.evac.length, 11);
    });

    test('sprinkler has 8 items', function () {
      assert.equal(window.CHECKLISTS.sprinkler.length, 8);
    });

    test('porte_rei has 7 items', function () {
      assert.equal(window.CHECKLISTS.porte_rei.length, 7);
    });

    test('p1_irai has 15 items', function () {
      assert.equal(window.CHECKLISTS.p1_irai.length, 15);
    });

    test('All p1_irai items have freq "p1"', function () {
      window.CHECKLISTS.p1_irai.forEach(function (item, i) {
        assert.equal(item.freq, 'p1', 'p1_irai[' + i + '] freq is "' + item.freq + '"');
      });
    });

    test('All estintori items start with "est_"', function () {
      window.CHECKLISTS.estintori.forEach(function (item) {
        assert.matches(item.id, /^est_\d+$/, 'ID "' + item.id + '" does not match pattern');
      });
    });

    test('Checklist norms reference known standard bodies', function () {
      var validPatterns = /UNI|D\.Lgs|D\.M\.|EN/i;
      REQUIRED_TYPES.forEach(function (t) {
        window.CHECKLISTS[t].forEach(function (item) {
          assert.matches(item.norm, validPatterns, t + ' item "' + item.id + '" norm missing standard ref');
        });
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── C) FREQ_MONTHS TESTS ─────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('FREQ_MONTHS', function () {
    var EXPECTED = {
      mensile: 1, bimestrale: 2, trimestrale: 3,
      semestrale: 6, annuale: 12, biennale: 24,
      triennale: 36, quinquennale: 60, decennale: 120,
    };

    test('FREQ_MONTHS is defined', function () {
      assert.notNull(window.FREQ_MONTHS);
    });

    test('FREQ_MONTHS has all 9 frequency keys', function () {
      var keys = Object.keys(window.FREQ_MONTHS);
      assert.equal(keys.length, 9, 'Expected 9 keys, got ' + keys.length);
      Object.keys(EXPECTED).forEach(function (k) {
        assert.has(window.FREQ_MONTHS, k, 'Missing key: ' + k);
      });
    });

    test('Each frequency maps to correct month count', function () {
      Object.keys(EXPECTED).forEach(function (k) {
        assert.equal(window.FREQ_MONTHS[k], EXPECTED[k], k + ' expected ' + EXPECTED[k] + ', got ' + window.FREQ_MONTHS[k]);
      });
    });

    test('All values are positive integers', function () {
      Object.keys(window.FREQ_MONTHS).forEach(function (k) {
        var v = window.FREQ_MONTHS[k];
        assert.ok(Number.isInteger(v) && v > 0, k + ' = ' + v + ' is not a positive integer');
      });
    });

    test('Frequencies are monotonically increasing', function () {
      var keys = Object.keys(EXPECTED);
      for (var i = 1; i < keys.length; i++) {
        assert.gt(window.FREQ_MONTHS[keys[i]], window.FREQ_MONTHS[keys[i - 1]],
          keys[i] + ' (' + window.FREQ_MONTHS[keys[i]] + ') <= ' + keys[i - 1] + ' (' + window.FREQ_MONTHS[keys[i - 1]] + ')');
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── D) EQ_TYPE_LABELS TESTS ──────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('EQ_TYPE_LABELS', function () {
    var EXPECTED = {
      estintori: 'Estintori', idranti: 'Idranti', irai: 'IRAI',
      evac: 'EVAC', sprinkler: 'Sprinkler', porte_rei: 'Porte REI',
    };

    test('EQ_TYPE_LABELS is defined', function () {
      assert.notNull(window.EQ_TYPE_LABELS);
    });

    test('EQ_TYPE_LABELS has all 6 equipment types', function () {
      assert.equal(Object.keys(window.EQ_TYPE_LABELS).length, 6);
      Object.keys(EXPECTED).forEach(function (k) {
        assert.has(window.EQ_TYPE_LABELS, k, 'Missing: ' + k);
      });
    });

    test('Each type maps to a non-empty string label', function () {
      Object.keys(EXPECTED).forEach(function (k) {
        assert.type(window.EQ_TYPE_LABELS[k], 'string', k + ' label is not a string');
        assert.gt(window.EQ_TYPE_LABELS[k].length, 0, k + ' label is empty');
      });
    });

    test('Labels match expected values', function () {
      Object.keys(EXPECTED).forEach(function (k) {
        assert.equal(window.EQ_TYPE_LABELS[k], EXPECTED[k]);
      });
    });

    test('No type key is empty or whitespace', function () {
      Object.keys(window.EQ_TYPE_LABELS).forEach(function (k) {
        assert.ok(k.trim().length > 0, 'Key is empty/whitespace');
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── E) NAVIGATION TESTS ──────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Navigation', function () {
    var EXPECTED_SCREENS = {
      dashboard: 'Dashboard', clienti: 'Clienti',
      intervento: 'Intervento', scadenzario: 'Scadenzario',
      verbali: 'Verbali', team: 'Team', agenda: 'Agenda',
    };

    test('navigate function exists', function () {
      assert.type(window.navigate, 'function');
    });

    test('goBack function exists', function () {
      assert.type(window.goBack, 'function');
    });

    test('SCREEN_TITLES is defined', function () {
      assert.notNull(window.SCREEN_TITLES);
      assert.type(window.SCREEN_TITLES, 'object');
    });

    test('SCREEN_TITLES has all 7 expected screens', function () {
      assert.equal(Object.keys(window.SCREEN_TITLES).length, 7);
      Object.keys(EXPECTED_SCREENS).forEach(function (k) {
        assert.has(window.SCREEN_TITLES, k, 'Missing screen: ' + k);
      });
    });

    test('Screen titles match expected Italian labels', function () {
      Object.keys(EXPECTED_SCREENS).forEach(function (k) {
        assert.equal(window.SCREEN_TITLES[k], EXPECTED_SCREENS[k]);
      });
    });

    test('state.navHistory is an array (navigation stack)', function () {
      assert.isArray(window.state.navHistory);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── F) UTILITY FUNCTION TESTS ────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Utility Functions', function () {

    // --- esc() ---
    test('esc() exists and is a function', function () {
      assert.type(window.esc, 'function');
    });

    test('esc() escapes HTML special characters', function () {
      assert.matches(window.esc('<b>"test"&</b>'), /&lt;/);
      assert.matches(window.esc('<b>"test"&</b>'), /&gt;/);
      assert.matches(window.esc('<b>"test"&</b>'), /&amp;/);
    });

    test('esc() returns empty string for null/undefined', function () {
      assert.equal(window.esc(null), '');
      assert.equal(window.esc(undefined), '');
    });

    test('esc() returns string for number input', function () {
      assert.equal(window.esc(42), '42');
    });

    // --- formatDate() ---
    test('formatDate() exists and is a function', function () {
      assert.type(window.formatDate, 'function');
    });

    test('formatDate() returns "—" for falsy input', function () {
      assert.equal(window.formatDate(null), '—');
      assert.equal(window.formatDate(''), '—');
      assert.equal(window.formatDate(undefined), '—');
    });

    test('formatDate() returns Italian formatted date string', function () {
      var result = window.formatDate('2026-01-15');
      assert.matches(result, /\d{2}\/\d{2}\/\d{4}/, 'Expected dd/mm/yyyy format, got: ' + result);
    });

    test('formatDate("2026-01-15") contains correct day and month', function () {
      var result = window.formatDate('2026-01-15');
      assert.ok(result.includes('15'), 'Should contain day 15');
      assert.ok(result.includes('01'), 'Should contain month 01');
      assert.ok(result.includes('2026'), 'Should contain year 2026');
    });

    // --- capitalize() ---
    test('capitalize() exists and is a function', function () {
      assert.type(window.capitalize, 'function');
    });

    test('capitalize() capitalizes first letter', function () {
      assert.equal(window.capitalize('hello'), 'Hello');
      assert.equal(window.capitalize('estintori'), 'Estintori');
    });

    test('capitalize() replaces underscores with spaces', function () {
      assert.equal(window.capitalize('porte_rei'), 'Porte rei');
    });

    test('capitalize() returns empty string for falsy input', function () {
      assert.equal(window.capitalize(null), '');
      assert.equal(window.capitalize(''), '');
    });

    // --- daysBetween() ---
    test('daysBetween() exists and is a function', function () {
      assert.type(window.daysBetween, 'function');
    });

    test('daysBetween() returns 0 for same date', function () {
      assert.equal(window.daysBetween('2026-01-01', '2026-01-01'), 0);
    });

    test('daysBetween() returns positive for future', function () {
      assert.equal(window.daysBetween('2026-01-01', '2026-01-08'), 7);
    });

    test('daysBetween() returns negative for past', function () {
      assert.equal(window.daysBetween('2026-01-08', '2026-01-01'), -7);
    });

    // --- isOlderThan() ---
    test('isOlderThan() exists and is a function', function () {
      assert.type(window.isOlderThan, 'function');
    });

    test('isOlderThan() returns false for null', function () {
      assert.equal(window.isOlderThan(null, 10), false);
    });

    test('isOlderThan() returns true for date older than threshold', function () {
      var old = new Date();
      old.setFullYear(old.getFullYear() - 20);
      var dateStr = old.toISOString().split('T')[0];
      assert.equal(window.isOlderThan(dateStr, 10), true);
    });

    test('isOlderThan() returns false for recent date', function () {
      var recent = new Date().toISOString().split('T')[0];
      assert.equal(window.isOlderThan(recent, 10), false);
    });

    // --- addDays() ---
    test('addDays() exists and is a function', function () {
      assert.type(window.addDays, 'function');
    });

    test('addDays() adds correctly', function () {
      assert.equal(window.addDays('2026-01-01', 1), '2026-01-02');
    });

    test('addDays() handles month boundary', function () {
      assert.equal(window.addDays('2026-01-31', 1), '2026-02-01');
    });

    test('addDays() handles year boundary', function () {
      assert.equal(window.addDays('2026-12-31', 1), '2027-01-01');
    });

    test('addDays() returns ISO date format', function () {
      var result = window.addDays('2026-06-15', 10);
      assert.matches(result, /^\d{4}-\d{2}-\d{2}$/);
    });

    // --- addMonths() ---
    test('addMonths() exists and is a function', function () {
      assert.type(window.addMonths, 'function');
    });

    test('addMonths() adds correctly', function () {
      assert.equal(window.addMonths('2026-01-15', 1), '2026-02-15');
    });

    test('addMonths() handles year rollover', function () {
      assert.equal(window.addMonths('2026-11-15', 2), '2027-01-15');
    });

    // --- categoryIcon() ---
    test('categoryIcon() exists and is a function', function () {
      assert.type(window.categoryIcon, 'function');
    });

    test('categoryIcon() returns object with bg and svg', function () {
      var icon = window.categoryIcon('commerciale');
      assert.has(icon, 'bg');
      assert.has(icon, 'svg');
    });

    test('categoryIcon() returns SVG string containing <svg', function () {
      var icon = window.categoryIcon('ospedale');
      assert.matches(icon.svg, /<svg/);
    });

    test('categoryIcon() falls back to commerciale for unknown category', function () {
      var icon = window.categoryIcon('unknown_cat');
      var fallback = window.categoryIcon('commerciale');
      assert.equal(icon.bg, fallback.bg);
    });

    test('categoryIcon() handles all known categories', function () {
      ['commerciale', 'industriale', 'scuola', 'ospedale', 'albergo'].forEach(function (cat) {
        var icon = window.categoryIcon(cat);
        assert.ok(icon.bg && icon.bg.length > 0, cat + ' missing bg color');
        assert.ok(icon.svg && icon.svg.length > 0, cat + ' missing svg');
      });
    });

    // --- statusBadge() ---
    test('statusBadge() exists and is a function', function () {
      assert.type(window.statusBadge, 'function');
    });

    test('statusBadge() returns HTML string with badge class', function () {
      var html = window.statusBadge('completed');
      assert.matches(html, /class="badge/);
      assert.matches(html, /<span/);
    });

    test('statusBadge() shows "Completato" for completed', function () {
      var html = window.statusBadge('completed');
      assert.matches(html, /Completato/);
    });

    test('statusBadge() shows "Conforme" for conforme', function () {
      var html = window.statusBadge('conforme');
      assert.matches(html, /Conforme/);
    });

    test('statusBadge() handles all known statuses', function () {
      var statuses = ['draft', 'in_progress', 'completed', 'signed', 'conforme', 'anomalie', 'non_conforme', 'pending'];
      statuses.forEach(function (s) {
        var html = window.statusBadge(s);
        assert.ok(html.length > 0, 'Empty badge for status: ' + s);
      });
    });

    test('statusBadge() falls back to raw status text for unknown', function () {
      var html = window.statusBadge('weird_status');
      assert.matches(html, /weird_status/);
    });

    // --- outcomeLabel() ---
    test('outcomeLabel() exists and is a function', function () {
      assert.type(window.outcomeLabel, 'function');
    });

    test('outcomeLabel() maps outcomes correctly', function () {
      assert.equal(window.outcomeLabel('conforme'), 'Conforme');
      assert.equal(window.outcomeLabel('anomalie'), 'Conforme con anomalie');
      assert.equal(window.outcomeLabel('non_conforme'), 'Non conforme');
      assert.equal(window.outcomeLabel('pending'), 'In corso');
      assert.equal(window.outcomeLabel(null), '—');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── G) DOM TESTS ─────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('DOM Elements', function () {
    var REQUIRED_IDS = [
      'page-login', 'app', 'modal-overlay', 'modal-content',
      'toast', 'loading',
      'screen-dashboard', 'screen-clienti', 'screen-intervento',
      'screen-scadenzario', 'screen-verbali', 'screen-agenda', 'screen-team',
      'topbar-title', 'topbar-subtitle', 'btn-back',
      'greeting',
      'kpi-oggi', 'kpi-scadenze', 'kpi-anomalie', 'kpi-clienti',
      'alerts-container', 'today-interventions',
      'search-clienti', 'clienti-list',
      'checklist-area', 'intervento-tabs',
      'scadenzario-list', 'verbali-list', 'team-list', 'agenda-days',
      'form-login', 'input-email', 'input-password', 'login-error',
      'user-badge', 'offline-banner',
    ];

    test('el() helper function exists', function () {
      assert.type(window.el, 'function');
    });

    REQUIRED_IDS.forEach(function (id) {
      test('DOM element #' + id + ' exists', function () {
        var elem = document.getElementById(id);
        assert.notNull(elem, 'Element #' + id + ' not found in DOM');
      });
    });

    test('Bottom nav has nav-items with data-screen attributes', function () {
      var navItems = document.querySelectorAll('.nav-item[data-screen]');
      assert.gte(navItems.length, 4, 'Expected at least 4 nav items');
    });

    test('Nav items cover all main screens', function () {
      var expectedScreens = ['dashboard', 'clienti', 'agenda', 'verbali'];
      expectedScreens.forEach(function (s) {
        var item = document.querySelector('.nav-item[data-screen="' + s + '"]');
        assert.notNull(item, 'Nav item for screen "' + s + '" not found');
      });
    });

    test('App shell starts hidden (login visible)', function () {
      var app = document.getElementById('app');
      assert.ok(app.classList.contains('hidden') || document.getElementById('page-login').style.display !== 'none',
        'App should start hidden or login visible');
    });

    test('Modal overlay starts hidden', function () {
      var overlay = document.getElementById('modal-overlay');
      assert.ok(overlay.classList.contains('hidden'), 'Modal overlay should start hidden');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── H) SUPABASE CLIENT TESTS ─────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Supabase Client', function () {
    test('db (Supabase client) is defined', function () {
      assert.notNull(window.db, 'db is not defined');
    });

    test('db has .from() method', function () {
      assert.type(window.db.from, 'function');
    });

    test('db has .auth object', function () {
      assert.notNull(window.db.auth);
    });

    test('db.auth has .signInWithPassword()', function () {
      assert.type(window.db.auth.signInWithPassword, 'function');
    });

    test('db.auth has .signOut()', function () {
      assert.type(window.db.auth.signOut, 'function');
    });

    test('db.auth has .getSession()', function () {
      assert.type(window.db.auth.getSession, 'function');
    });

    test('db.auth has .onAuthStateChange()', function () {
      assert.type(window.db.auth.onAuthStateChange, 'function');
    });

    test('db has .storage object', function () {
      assert.notNull(window.db.storage);
    });

    test('db has .rpc() method', function () {
      assert.type(window.db.rpc, 'function');
    });

    test('db has .functions object', function () {
      assert.notNull(window.db.functions);
    });

    test('db.functions has .invoke() method', function () {
      assert.type(window.db.functions.invoke, 'function');
    });

    test('db.from("clients") returns a query builder', function () {
      var qb = window.db.from('clients');
      assert.notNull(qb);
      assert.type(qb.select, 'function');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── I) STATE TESTS ───────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('State', function () {
    test('state object is defined', function () {
      assert.notNull(window.state);
      assert.type(window.state, 'object');
    });

    test('state has all required keys', function () {
      var requiredKeys = [
        'user', 'profile', 'org', 'clients', 'currentClientId',
        'currentInterventionId', 'currentInterventionType',
        'currentEquipmentTypes', 'currentTab', 'currentEquipment',
        'checklistResponses', 'scadenze', 'filter', 'navHistory',
      ];
      requiredKeys.forEach(function (k) {
        assert.has(window.state, k, 'state missing key: ' + k);
      });
    });

    test('state.clients is an array', function () {
      assert.isArray(window.state.clients);
    });

    test('state.checklistResponses is an object', function () {
      assert.type(window.state.checklistResponses, 'object');
    });

    test('state.currentTab defaults to "estintori"', function () {
      assert.equal(window.state.currentTab, 'estintori');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── J) PLAN LIMITS TESTS ─────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Plan Limits', function () {
    test('PLAN_LIMITS is defined', function () {
      assert.notNull(window.PLAN_LIMITS);
    });

    test('PLAN_LIMITS has trial, starter, pro, agenzia', function () {
      ['trial', 'starter', 'pro', 'agenzia'].forEach(function (p) {
        assert.has(window.PLAN_LIMITS, p, 'Missing plan: ' + p);
      });
    });

    test('Each plan has clients, technicians, logo, export, label', function () {
      ['trial', 'starter', 'pro', 'agenzia'].forEach(function (p) {
        var plan = window.PLAN_LIMITS[p];
        ['clients', 'technicians', 'logo', 'export', 'label'].forEach(function (f) {
          assert.has(plan, f, p + ' missing field: ' + f);
        });
      });
    });

    test('trial plan has lowest limits', function () {
      assert.ok(window.PLAN_LIMITS.trial.clients <= window.PLAN_LIMITS.starter.clients);
      assert.ok(window.PLAN_LIMITS.trial.technicians <= window.PLAN_LIMITS.starter.technicians);
    });

    test('pro plan has logo enabled', function () {
      assert.equal(window.PLAN_LIMITS.pro.logo, true);
    });

    test('agenzia plan has export enabled', function () {
      assert.equal(window.PLAN_LIMITS.agenzia.export, true);
    });

    test('planLimits() function exists', function () {
      assert.type(window.planLimits, 'function');
    });

    test('planAllows() function exists', function () {
      assert.type(window.planAllows, 'function');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── K) AUTH-DEPENDENT TESTS (require login) ──────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Auth-Dependent (require login)', function () {
    test('isAdmin() function exists', function () {
      assert.type(window.isAdmin, 'function');
    });

    test('loadProfile() function exists', function () {
      assert.type(window.loadProfile, 'function');
    });

    test('showApp() function exists', function () {
      assert.type(window.showApp, 'function');
    });

    test('showLogin() function exists', function () {
      assert.type(window.showLogin, 'function');
    });

    test('showModal() function exists', function () {
      assert.type(window.showModal, 'function');
    });

    test('closeModal() function exists', function () {
      assert.type(window.closeModal, 'function');
    });

    test('showToast() function exists', function () {
      assert.type(window.showToast, 'function');
    });

    test('showLoading() function exists', function () {
      assert.type(window.showLoading, 'function');
    });

    test('state.user is set when authenticated', function () {
      var t = { status: 'pending', detail: '' };
      if (!requireLogin(t)) return;
      assert.notNull(window.state.user);
    });

    test('state.profile is loaded when authenticated', function () {
      var t = { status: 'pending', detail: '' };
      if (!requireLogin(t)) return;
      assert.notNull(window.state.profile);
    });

    test('state.org is loaded when authenticated', function () {
      var t = { status: 'pending', detail: '' };
      if (!requireLogin(t)) return;
      assert.notNull(window.state.org);
    });

    test('state.user.id is a valid UUID', function () {
      var t = { status: 'pending', detail: '' };
      if (!requireLogin(t)) return;
      assert.matches(window.state.user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── L) INTEGRATION / CROSS-REFERENCE TESTS ───────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  describe('Cross-References', function () {
    test('Every CHECKLISTS type key has a corresponding EQ_TYPE_LABELS entry (except p1_irai)', function () {
      Object.keys(window.CHECKLISTS).forEach(function (t) {
        if (t === 'p1_irai') return;
        assert.has(window.EQ_TYPE_LABELS, t, 'CHECKLISTS key "' + t + '" has no EQ_TYPE_LABELS entry');
      });
    });

    test('Every EQ_TYPE_LABELS key has a corresponding CHECKLISTS entry', function () {
      Object.keys(window.EQ_TYPE_LABELS).forEach(function (t) {
        assert.has(window.CHECKLISTS, t, 'EQ_TYPE_LABELS key "' + t + '" has no CHECKLISTS entry');
      });
    });

    test('All unique freq values in CHECKLISTS (excluding p1) exist in FREQ_MONTHS', function () {
      var freqs = new Set();
      Object.values(window.CHECKLISTS).forEach(function (items) {
        items.forEach(function (item) {
          if (item.freq !== 'p1') freqs.add(item.freq);
        });
      });
      freqs.forEach(function (f) {
        assert.has(window.FREQ_MONTHS, f, 'Freq "' + f + '" not in FREQ_MONTHS');
      });
    });

    test('SCREEN_TITLES dashboard key matches navigate target', function () {
      assert.has(window.SCREEN_TITLES, 'dashboard');
      assert.equal(window.SCREEN_TITLES.dashboard, 'Dashboard');
    });

    test('el() returns the same as document.getElementById()', function () {
      var elResult = window.el('page-login');
      var domResult = document.getElementById('page-login');
      assert.ok(elResult === domResult, 'el() and getElementById() return different elements');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ─── RUNNER ───────────────────────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════════════════════════
  window.runAllTests = function () {
    _results = [];
    var startTime = performance.now();

    // Execute all test functions
    _results.forEach(function (r) {
      try {
        r.fn();
        if (r.status === 'pending') r.status = 'pass';
      } catch (e) {
        r.status = 'fail';
        r.detail = e.message || String(e);
      }
    });

    var elapsed = performance.now() - startTime;
    renderResults(elapsed);
  };

  function renderResults(elapsedMs) {
    var passed = 0, failed = 0, skipped = 0;
    _results.forEach(function (r) {
      if (r.status === 'pass') passed++;
      else if (r.status === 'fail') failed++;
      else if (r.status === 'skipped') skipped++;
    });
    var total = _results.length;

    // Show summary
    document.getElementById('summary').style.display = '';
    document.getElementById('s-total').textContent = total;
    document.getElementById('s-passed').textContent = passed;
    document.getElementById('s-failed').textContent = failed;
    document.getElementById('s-skipped').textContent = skipped;

    // Progress bar
    document.getElementById('progress-bar').style.display = '';
    document.getElementById('prog-passed').style.width = (total ? (passed / total * 100) : 0) + '%';
    document.getElementById('prog-failed').style.width = (total ? (failed / total * 100) : 0) + '%';
    document.getElementById('prog-skipped').style.width = (total ? (skipped / total * 100) : 0) + '%';

    // Duration
    document.getElementById('duration').style.display = '';
    document.getElementById('duration').textContent = 'Completed in ' + elapsedMs.toFixed(1) + 'ms';

    // Hide idle, show table
    document.getElementById('idle-msg').style.display = 'none';
    document.getElementById('table-wrap').style.display = '';

    // Render table rows
    var tbody = document.getElementById('results-body');
    tbody.innerHTML = '';
    var currentDescribe = '';
    var idx = 0;

    _results.forEach(function (r) {
      // Category row
      if (r.describe !== currentDescribe) {
        currentDescribe = r.describe;
        var catRow = document.createElement('tr');
        catRow.className = 'cat-row';
        catRow.innerHTML = '<td colspan="4">' + escHtml(currentDescribe) + '</td>';
        tbody.appendChild(catRow);
      }

      idx++;
      var tr = document.createElement('tr');
      var statusCls = r.status === 'pass' ? 'pass' : r.status === 'fail' ? 'fail' : 'skip';
      var statusLabel = r.status === 'pass' ? 'PASS' : r.status === 'fail' ? 'FAIL' : 'SKIP';
      var detailHtml = r.detail
        ? '<div class="detail-msg' + (r.status === 'fail' ? ' err' : '') + '">' + escHtml(r.detail) + '</div>'
        : '';

      tr.innerHTML =
        '<td style="color:var(--text-dim);font-size:11px">' + idx + '</td>' +
        '<td>' + escHtml(r.name) + '</td>' +
        '<td><span class="badge ' + statusCls + '">' + statusLabel + '</span></td>' +
        '<td>' + detailHtml + '</td>';
      tbody.appendChild(tr);
    });
  }

  function escHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // Kick off: define tests on load (but don't run until button press)
  // The describe/test calls above populate _results with pending tests.
})();
