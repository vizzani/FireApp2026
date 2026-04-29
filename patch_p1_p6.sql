-- ============================================================
--  FireApp — Patch P1/P6
--  Eseguire in Supabase > SQL Editor > Run
-- ============================================================

-- 1. Aggiunge data_installazione alla tabella equipment (per logica P6)
ALTER TABLE equipment
  ADD COLUMN IF NOT EXISTS installation_date DATE;

-- 2. Aggiunge colonna photo_url per foto anomalie
ALTER TABLE checklist_responses
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- 3. Indice per trovare rapidamente i componenti con data_installazione
CREATE INDEX IF NOT EXISTS idx_equipment_install_date
  ON equipment (installation_date)
  WHERE installation_date IS NOT NULL;

-- 4. Vista: componenti con revisione P6 scaduta (> 12 anni)
CREATE OR REPLACE VIEW equipment_p6_overdue AS
SELECT
  e.*,
  c.name AS client_name,
  c.city AS client_city,
  EXTRACT(YEAR FROM AGE(NOW(), e.installation_date::TIMESTAMPTZ))::INTEGER AS years_installed
FROM equipment e
JOIN clients c ON c.id = e.client_id
WHERE e.installation_date IS NOT NULL
  AND e.installation_date < (NOW() - INTERVAL '12 years')
ORDER BY e.installation_date ASC;

-- Come aggiornare la data di installazione di un impianto:
-- UPDATE equipment SET installation_date = '2010-06-15' WHERE id = 'UUID-IMPIANTO';
