-- ============================================================
--  FireApp — Audit Trail  (patch)
--  Incollare in: Supabase > SQL Editor > Run
--  Richiede: schema.sql originale (my_org_id(), profiles, org)
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabella audit_log
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  user_id         UUID REFERENCES auth.users(id),
  action          TEXT NOT NULL,
  entity_type     TEXT NOT NULL,
  entity_id       UUID,
  details         JSONB DEFAULT '{}',
  ip_address      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 2. RLS
-- ------------------------------------------------------------
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_own_org" ON audit_log
  FOR ALL USING (organization_id = my_org_id());

-- ------------------------------------------------------------
-- 3. Funzione helper: inserisce un record di audit
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION log_audit_action(
  p_action      TEXT,
  p_entity_type TEXT,
  p_entity_id   UUID   DEFAULT NULL,
  p_details     JSONB  DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_org UUID;
BEGIN
  v_org := my_org_id();

  INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, details)
  VALUES (v_org, auth.uid(), p_action, p_entity_type, p_entity_id, p_details)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ------------------------------------------------------------
-- 4. Funzione: legge i log di un'organizzazione
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_audit_logs(
  p_org_id UUID,
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  action          TEXT,
  entity_type     TEXT,
  entity_id       UUID,
  details         JSONB,
  ip_address      TEXT,
  user_full_name  TEXT,
  created_at      TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    a.id,
    a.action,
    a.entity_type,
    a.entity_id,
    a.details,
    a.ip_address,
    p.full_name AS user_full_name,
    a.created_at
  FROM audit_log a
  LEFT JOIN profiles p ON p.id = a.user_id
  WHERE a.organization_id = p_org_id
  ORDER BY a.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
$$;

-- ------------------------------------------------------------
-- 5. Indici per performance
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_log_org    ON audit_log (organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_date   ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id);

-- ------------------------------------------------------------
-- 6. Vista: riepilogo conteggi per azione nei 30 giorni
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW audit_log_summary AS
SELECT
  a.organization_id,
  a.action,
  a.entity_type,
  a.created_at::DATE AS day,
  COUNT(*)           AS action_count
FROM audit_log a
WHERE a.created_at >= NOW() - INTERVAL '30 days'
GROUP BY a.organization_id, a.action, a.entity_type, a.created_at::DATE
ORDER BY a.organization_id, day DESC, action_count DESC;
