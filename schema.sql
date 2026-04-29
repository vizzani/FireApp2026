-- ============================================================
--  FireApp — Schema Supabase
--  Incollare intero contenuto in: Supabase > SQL Editor > Run
-- ============================================================

-- Abilita estensioni utili
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ------------------------------------------------------------
-- ORGANIZATIONS  (ogni azienda cliente SaaS = 1 organizzazione)
-- ------------------------------------------------------------
CREATE TABLE organizations (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name         TEXT NOT NULL,
  vat_number   TEXT,
  address      TEXT,
  city         TEXT,
  phone        TEXT,
  email        TEXT,
  logo_url     TEXT,
  plan         TEXT DEFAULT 'trial',  -- trial | starter | pro
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- PROFILES  (estende auth.users — un profilo per tecnico)
-- ------------------------------------------------------------
CREATE TABLE profiles (
  id              UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  full_name       TEXT,
  role            TEXT DEFAULT 'technician',  -- admin | technician
  cert_number     TEXT,   -- numero certificato VVF
  phone           TEXT,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Crea il profilo automaticamente quando un utente si registra
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ------------------------------------------------------------
-- CLIENTS  (clienti finali dell'azienda di manutenzione)
-- ------------------------------------------------------------
CREATE TABLE clients (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL,
  address         TEXT,
  city            TEXT,
  province        TEXT,
  phone           TEXT,
  email           TEXT,
  contact_name    TEXT,
  category        TEXT DEFAULT 'commerciale', -- commerciale | industriale | civile | scuola | ospedale
  notes           TEXT,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- EQUIPMENT  (impianti installati presso ogni cliente)
-- ------------------------------------------------------------
CREATE TABLE equipment (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id         UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  type              TEXT NOT NULL,  -- estintori | idranti | irai | evac | sprinkler | porte_rei
  quantity          INTEGER DEFAULT 1,
  brand             TEXT,
  model             TEXT,
  serial_number     TEXT,
  location          TEXT,           -- piano, locale, zona
  installation_date DATE,
  last_service_date DATE,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- INTERVENTIONS  (visite di manutenzione)
-- ------------------------------------------------------------
CREATE TABLE interventions (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id     UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  client_id           UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  technician_id       UUID REFERENCES profiles(id),
  date                DATE NOT NULL DEFAULT CURRENT_DATE,
  type                TEXT DEFAULT 'semestrale',  -- semestrale | annuale | triennale | decennale | straordinario
  equipment_types     TEXT[] DEFAULT '{}',        -- es: {estintori, idranti, irai}
  status              TEXT DEFAULT 'draft',       -- draft | in_progress | completed | signed
  report_number       TEXT,                       -- numero verbale (es: 2026/041)
  outcome             TEXT DEFAULT 'pending',     -- pending | conforme | non_conforme | anomalie
  notes               TEXT,
  client_signature    TEXT,                       -- base64 della firma
  pdf_url             TEXT,                       -- URL PDF su Supabase Storage
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
);

-- Genera numero verbale automatico: ANNO/NNN
CREATE OR REPLACE FUNCTION generate_report_number(org_id UUID)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  year_str TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  count_n  INTEGER;
BEGIN
  SELECT COUNT(*) + 1 INTO count_n
  FROM interventions
  WHERE organization_id = org_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  RETURN year_str || '/' || LPAD(count_n::TEXT, 3, '0');
END;
$$;

-- ------------------------------------------------------------
-- CHECKLIST_RESPONSES  (risposte ai singoli punti di controllo)
-- ------------------------------------------------------------
CREATE TABLE checklist_responses (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  intervention_id UUID REFERENCES interventions(id) ON DELETE CASCADE NOT NULL,
  item_id         TEXT NOT NULL,          -- es: 'est_01', 'irai_03'
  equipment_type  TEXT NOT NULL,
  status          TEXT DEFAULT 'pending', -- ok | anomaly | na | pending
  note            TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (intervention_id, item_id)
);

-- ------------------------------------------------------------
-- ANOMALIES  (problemi rilevati durante l'intervento)
-- ------------------------------------------------------------
CREATE TABLE anomalies (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  intervention_id UUID REFERENCES interventions(id) ON DELETE CASCADE NOT NULL,
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  item_id         TEXT NOT NULL,
  equipment_type  TEXT NOT NULL,
  description     TEXT NOT NULL,
  severity        TEXT DEFAULT 'medium',  -- low | medium | high | critical
  resolved        BOOLEAN DEFAULT FALSE,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- SCHEDULES  (scadenziario manutenzioni future)
-- ------------------------------------------------------------
CREATE TABLE schedules (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id       UUID REFERENCES clients(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  equipment_type  TEXT NOT NULL,
  maintenance_type TEXT NOT NULL,  -- semestrale | mensile | annuale | triennale | decennale
  last_date       DATE,
  next_date       DATE NOT NULL,
  intervention_id UUID REFERENCES interventions(id),
  status          TEXT DEFAULT 'scheduled',  -- scheduled | overdue | completed
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
-- Ogni azienda vede SOLO i propri dati
-- ------------------------------------------------------------
ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients              ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment            ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_responses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE anomalies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules            ENABLE ROW LEVEL SECURITY;

-- Helper function: restituisce l'org_id dell'utente loggato
CREATE OR REPLACE FUNCTION my_org_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$;

-- Policies organizations
CREATE POLICY "org_self" ON organizations
  FOR ALL USING (id = my_org_id());

-- Policies profiles
CREATE POLICY "profile_self" ON profiles
  FOR ALL USING (organization_id = my_org_id());

-- Policies clients
CREATE POLICY "clients_own_org" ON clients
  FOR ALL USING (organization_id = my_org_id());

-- Policies equipment
CREATE POLICY "equipment_own_org" ON equipment
  FOR ALL USING (
    client_id IN (SELECT id FROM clients WHERE organization_id = my_org_id())
  );

-- Policies interventions
CREATE POLICY "interventions_own_org" ON interventions
  FOR ALL USING (organization_id = my_org_id());

-- Policies checklist_responses
CREATE POLICY "cl_responses_own_org" ON checklist_responses
  FOR ALL USING (
    intervention_id IN (SELECT id FROM interventions WHERE organization_id = my_org_id())
  );

-- Policies anomalies
CREATE POLICY "anomalies_own_org" ON anomalies
  FOR ALL USING (
    client_id IN (SELECT id FROM clients WHERE organization_id = my_org_id())
  );

-- Policies schedules
CREATE POLICY "schedules_own_org" ON schedules
  FOR ALL USING (organization_id = my_org_id());

-- ------------------------------------------------------------
-- STORAGE BUCKET per i PDF dei verbali
-- Eseguire separatamente da: Supabase > Storage > New Bucket
-- Nome bucket: "reports"  —  Public: NO
-- ------------------------------------------------------------

-- Indici per performance
CREATE INDEX idx_clients_org     ON clients (organization_id);
CREATE INDEX idx_interventions_org ON interventions (organization_id);
CREATE INDEX idx_interventions_client ON interventions (client_id);
CREATE INDEX idx_schedules_org   ON schedules (organization_id);
CREATE INDEX idx_schedules_next  ON schedules (next_date);
CREATE INDEX idx_cl_resp_interv  ON checklist_responses (intervention_id);
