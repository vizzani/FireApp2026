-- ============================================================================
-- FIREAPP: Configurazione cron job per notifiche push
-- ============================================================================
-- Questo script configura un job pg_cron per inviare notifiche push
-- all'Edge Function "send-push-notifications" su Supabase.
--
-- PREREQUISITI:
--   1. L'Edge Function "send-push-notifications" deve essere già deployata
--   2. L'estensione pg_cron deve essere disponibile sul tuo progetto
--      (disponibile sui piani Pro e successivi di Supabase)
--
-- NOTE PER I FREE TIER:
--   pg_cron NON è disponibile sui piani free di Supabase.
--   In tal caso, usa un servizio esterno (vedi la sezione in fondo al file).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Abilita le estensioni necessarie
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- 2. Configurazione URL e chiave di servizio
-- ---------------------------------------------------------------------------
-- Modo A (CONSIGLIATO): Usa le impostazioni personalizzate di PostgreSQL.
-- Aggiungi queste righe al tuo postgresql.conf (o via API Supabase):
--
--   app.settings.supabase_url = 'https://TUO-PROJ-ID.supabase.co'
--   app.settings.service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
--
-- In alternativa, se non puoi modificare postgresql.conf, sostituisci
-- i placeholder nei valori qui sotto con i dati reali del tuo progetto
-- e decommenta la variabile qui sotto.
-- ---------------------------------------------------------------------------
-- SELECT set_config('app.settings.supabase_url', 'https://TUO-PROJ-ID.supabase.co', false);
-- SELECT set_config('app.settings.service_role_key', 'eyJ...CHIAVE-Reale...', false);

-- ---------------------------------------------------------------------------
-- 3. Schedulazione del cron job
-- ---------------------------------------------------------------------------
-- Esegue la chiamata POST all'Edge Function tutti i lunedì-venerdì alle
-- 06:00 UTC (= 07:00 CET / 08:00 CEST circa).
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
  'fireapp-push-daily',
  '0 6 * * 1-5',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/send-push-notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ---------------------------------------------------------------------------
-- ALTERNATIVA: URL hardcoded (usa solo se set_config non è disponibile)
-- ---------------------------------------------------------------------------
-- Se non riesci a configurare app.settings, decommenta qui sotto
-- e sostituisci i placeholder con i valori reali:
--
-- SELECT cron.schedule(
--   'fireapp-push-daily',
--   '0 6 * * 1-5',
--   $$
--   SELECT net.http_post(
--     url := 'https://TUO-PROJ-ID.supabase.co/functions/v1/send-push-notifications',
--     headers := jsonb_build_object(
--       'Authorization', 'Bearer eyl...CHIAVE-Reale...',
--       'Content-Type', 'application/json'
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- ---------------------------------------------------------------------------
-- 4. Comandi utili
-- ---------------------------------------------------------------------------
-- Per eseguire manualmente il job adesso:
--   SELECT cron.run('fireapp-push-daily');

-- Per rimuovere il job:
--   SELECT cron.unschedule('fireapp-push-daily');

-- Per verificare i job schedulati:
--   SELECT * FROM cron.job;

-- Per verificare la cronologia delle esecuzioni:
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- ---------------------------------------------------------------------------
-- 5. ALTERNATIVA per free tier: servizio esterno
-- ---------------------------------------------------------------------------
-- Se pg_cron non è disponibile (piano gratuito), puoi usare un servizio
-- esterno di schedulazione HTTP. Alcune opzioni gratuite:
--
--   • https://cron-job.org  — Fino a 50 job gratuiti, con intervallo minimo 1 min
--   • https://uptimerobot.com — Monitoraggio + ping, piano free generoso
--   • https://www.setcronjob.com — Alternativa semplice
--
-- Configurazione:
--   URL:    https://TUO-PROJ-ID.supabase.co/functions/v1/send-push-notifications
--   Method: POST
--   Headers:
--     Authorization: Bearer eyl...CHIAVE-Reale...
--     Content-Type:  application/json
--   Body:   {}
--   Schedule: Lun-Ven alle 07:00 (ora italiana)
--
-- IMPORTANTE: La chiave service_role è sensibile. Se usi un servizio esterno,
-- valuta di creare un Edge Function wrapper che validi un token interno
-- invece di esporre la chiave service_role direttamente.
