# FireApp Deploy Checklist

## 1. Supabase database

Esegui in Supabase SQL Editor, in questo ordine:

1. `schema.sql`
2. `patch_p1_p6.sql`
3. `supabase_step1_foundation.sql`
4. `supabase_step2_functions.sql`
5. `supabase_step3_policies_admin_view.sql`
6. `supabase_step4_security_hardening.sql`
7. `supabase_step5_saas_admin.sql`
8. `supabase_step6_plan_enforcement.sql`

Poi crea o promuovi il primo superadmin:

```sql
UPDATE profiles
SET role = 'superadmin'
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'tua-email@dominio.it'
);
```

## 2. Supabase storage

La migration step 3 crea il bucket privato `reports` e le policy. Verifica in Supabase Storage che il bucket esista e non sia pubblico.

## 3. Supabase Edge Functions

Struttura pronta:

- `supabase/functions/send-verbale-email/index.ts`
- `supabase/functions/send-push-notifications/index.ts`

Deploy:

```bash
supabase functions deploy send-verbale-email
supabase functions deploy send-push-notifications
```

Secrets necessari:

```bash
supabase secrets set RESEND_API_KEY=...
supabase secrets set RESEND_FROM_EMAIL=noreply@tuodominio.it
supabase secrets set RESEND_FROM_NAME=FireApp
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_EMAIL=mailto:admin@tuodominio.it
```

Nota: `generate-verbale-pdf` e' richiamata dall'app ma non e' ancora presente nel repository. L'app usa il fallback client-side con jsPDF se la funzione non risponde.

## 4. Frontend

Prima del lancio sostituisci:

- Iubenda `siteId`, `cookiePolicyId`, `privacy-policy/XXXXXXXX`
- dati legali in `termini.html` e `dpa.html`
- dominio/email ufficiali nei testi pubblici

## 5. Test end-to-end

1. Signup nuova azienda da `signup.html`
2. Login da `index.html`
3. Creazione cliente
4. Creazione impianto
5. Avvio e chiusura intervento
6. Generazione PDF
7. Invio email verbale
8. QR scheda impianto
9. Admin: cambio piano, estensione trial, sospensione azienda
