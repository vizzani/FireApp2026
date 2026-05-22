-- FireApp Supabase migration - STEP 3
-- RLS policy cleanup, admin view, storage bucket policies.
-- Run after supabase_step2_functions.sql.

DROP POLICY IF EXISTS "org_self" ON organizations;
DROP POLICY IF EXISTS "profile_self" ON profiles;
DROP POLICY IF EXISTS "clients_own_org" ON clients;
DROP POLICY IF EXISTS "equipment_own_org" ON equipment;
DROP POLICY IF EXISTS "interventions_own_org" ON interventions;
DROP POLICY IF EXISTS "cl_responses_own_org" ON checklist_responses;
DROP POLICY IF EXISTS "anomalies_own_org" ON anomalies;
DROP POLICY IF EXISTS "schedules_own_org" ON schedules;

DROP POLICY IF EXISTS org_select ON organizations;
DROP POLICY IF EXISTS org_admin_update ON organizations;
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_admin_update ON profiles;
DROP POLICY IF EXISTS clients_select ON clients;
DROP POLICY IF EXISTS clients_admin_insert ON clients;
DROP POLICY IF EXISTS clients_admin_update ON clients;
DROP POLICY IF EXISTS clients_admin_delete ON clients;
DROP POLICY IF EXISTS equipment_select ON equipment;
DROP POLICY IF EXISTS equipment_admin_write ON equipment;
DROP POLICY IF EXISTS interventions_select ON interventions;
DROP POLICY IF EXISTS interventions_member_insert ON interventions;
DROP POLICY IF EXISTS interventions_member_update ON interventions;
DROP POLICY IF EXISTS checklist_select ON checklist_responses;
DROP POLICY IF EXISTS checklist_member_write ON checklist_responses;
DROP POLICY IF EXISTS anomalies_select ON anomalies;
DROP POLICY IF EXISTS anomalies_member_write ON anomalies;
DROP POLICY IF EXISTS schedules_select ON schedules;
DROP POLICY IF EXISTS schedules_member_write ON schedules;
DROP POLICY IF EXISTS push_subscriptions_own ON push_subscriptions;

CREATE POLICY org_select ON organizations
  FOR SELECT USING (id = public.my_org_id() OR public.is_superadmin());

CREATE POLICY org_admin_update ON organizations
  FOR UPDATE USING ((id = public.my_org_id() AND public.is_org_admin(id)) OR public.is_superadmin())
  WITH CHECK (id = public.my_org_id() OR public.is_superadmin());

CREATE POLICY profiles_select ON profiles
  FOR SELECT USING (id = auth.uid() OR organization_id = public.my_org_id() OR public.is_superadmin());

CREATE POLICY profiles_admin_update ON profiles
  FOR UPDATE USING ((organization_id = public.my_org_id() AND public.is_org_admin(organization_id)) OR public.is_superadmin())
  WITH CHECK (organization_id = public.my_org_id() OR organization_id IS NULL OR public.is_superadmin());

CREATE POLICY clients_select ON clients
  FOR SELECT USING (organization_id = public.my_org_id() OR public.is_superadmin());

CREATE POLICY clients_admin_insert ON clients
  FOR INSERT WITH CHECK ((organization_id = public.my_org_id() AND public.is_org_admin(organization_id)) OR public.is_superadmin());

CREATE POLICY clients_admin_update ON clients
  FOR UPDATE USING ((organization_id = public.my_org_id() AND public.is_org_admin(organization_id)) OR public.is_superadmin())
  WITH CHECK (organization_id = public.my_org_id() OR public.is_superadmin());

CREATE POLICY clients_admin_delete ON clients
  FOR DELETE USING ((organization_id = public.my_org_id() AND public.is_org_admin(organization_id)) OR public.is_superadmin());

CREATE POLICY equipment_select ON equipment
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM clients c WHERE c.id = equipment.client_id AND (c.organization_id = public.my_org_id() OR public.is_superadmin()))
  );

CREATE POLICY equipment_admin_write ON equipment
  FOR ALL USING (
    EXISTS (SELECT 1 FROM clients c WHERE c.id = equipment.client_id AND (public.is_org_admin(c.organization_id) OR public.is_superadmin()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM clients c WHERE c.id = equipment.client_id AND (public.is_org_admin(c.organization_id) OR public.is_superadmin()))
  );

CREATE POLICY interventions_select ON interventions
  FOR SELECT USING (organization_id = public.my_org_id() OR public.is_superadmin());

CREATE POLICY interventions_member_insert ON interventions
  FOR INSERT WITH CHECK (organization_id = public.my_org_id() OR public.is_superadmin());

CREATE POLICY interventions_member_update ON interventions
  FOR UPDATE USING (organization_id = public.my_org_id() OR public.is_superadmin())
  WITH CHECK (organization_id = public.my_org_id() OR public.is_superadmin());

CREATE POLICY checklist_select ON checklist_responses
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM interventions i WHERE i.id = checklist_responses.intervention_id AND (i.organization_id = public.my_org_id() OR public.is_superadmin()))
  );

CREATE POLICY checklist_member_write ON checklist_responses
  FOR ALL USING (
    EXISTS (SELECT 1 FROM interventions i WHERE i.id = checklist_responses.intervention_id AND (i.organization_id = public.my_org_id() OR public.is_superadmin()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM interventions i WHERE i.id = checklist_responses.intervention_id AND (i.organization_id = public.my_org_id() OR public.is_superadmin()))
  );

CREATE POLICY anomalies_select ON anomalies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM clients c WHERE c.id = anomalies.client_id AND (c.organization_id = public.my_org_id() OR public.is_superadmin()))
  );

CREATE POLICY anomalies_member_write ON anomalies
  FOR ALL USING (
    EXISTS (SELECT 1 FROM clients c WHERE c.id = anomalies.client_id AND (c.organization_id = public.my_org_id() OR public.is_superadmin()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM clients c WHERE c.id = anomalies.client_id AND (c.organization_id = public.my_org_id() OR public.is_superadmin()))
  );

CREATE POLICY schedules_select ON schedules
  FOR SELECT USING (organization_id = public.my_org_id() OR public.is_superadmin());

CREATE POLICY schedules_member_write ON schedules
  FOR ALL USING (organization_id = public.my_org_id() OR public.is_superadmin())
  WITH CHECK (organization_id = public.my_org_id() OR public.is_superadmin());

CREATE POLICY push_subscriptions_own ON push_subscriptions
  FOR ALL USING (user_id = auth.uid() OR org_id = public.my_org_id() OR public.is_superadmin())
  WITH CHECK ((user_id = auth.uid() AND org_id = public.my_org_id()) OR public.is_superadmin());

DROP VIEW IF EXISTS public.admin_organizations;

CREATE VIEW public.admin_organizations AS
SELECT
  o.*,
  CASE
    WHEN o.active = FALSE THEN 'sospeso'
    WHEN o.plan <> 'trial' THEN 'attivo'
    WHEN o.trial_expires_at < CURRENT_DATE THEN 'scaduto'
    ELSE 'trial'
  END AS status,
  GREATEST((o.trial_expires_at - CURRENT_DATE)::INTEGER, 0) AS trial_days_left,
  (SELECT COUNT(*) FROM public.clients c WHERE c.organization_id = o.id) AS clients_count,
  (SELECT COUNT(*) FROM public.profiles p WHERE p.organization_id = o.id) AS technicians_count,
  (SELECT COUNT(*) FROM public.interventions i WHERE i.organization_id = o.id) AS interventions_count,
  (SELECT MAX(i.created_at) FROM public.interventions i WHERE i.organization_id = o.id) AS last_activity
FROM public.organizations o
WHERE public.is_superadmin();

INSERT INTO storage.buckets (id, name, public)
VALUES ('reports', 'reports', FALSE)
ON CONFLICT (id) DO UPDATE SET public = FALSE;

DROP POLICY IF EXISTS reports_select_own_org ON storage.objects;
DROP POLICY IF EXISTS reports_insert_own_org ON storage.objects;
DROP POLICY IF EXISTS reports_update_own_org ON storage.objects;
DROP POLICY IF EXISTS reports_delete_own_org ON storage.objects;

CREATE POLICY reports_select_own_org ON storage.objects
  FOR SELECT USING (
    bucket_id = 'reports'
    AND (
      public.is_superadmin()
      OR (
        split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND split_part(name, '/', 1)::uuid = public.my_org_id()
      )
    )
  );

CREATE POLICY reports_insert_own_org ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'reports'
    AND (
      public.is_superadmin()
      OR (
        split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND split_part(name, '/', 1)::uuid = public.my_org_id()
      )
    )
  );

CREATE POLICY reports_update_own_org ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'reports'
    AND (
      public.is_superadmin()
      OR (
        split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND split_part(name, '/', 1)::uuid = public.my_org_id()
      )
    )
  )
  WITH CHECK (
    bucket_id = 'reports'
    AND (
      public.is_superadmin()
      OR (
        split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND split_part(name, '/', 1)::uuid = public.my_org_id()
      )
    )
  );

CREATE POLICY reports_delete_own_org ON storage.objects
  FOR DELETE USING (
    bucket_id = 'reports'
    AND (
      public.is_superadmin()
      OR (
        split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND split_part(name, '/', 1)::uuid = public.my_org_id()
      )
    )
  );
