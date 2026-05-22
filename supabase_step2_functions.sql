-- FireApp Supabase migration - STEP 2
-- RPC functions used by the frontend/admin/edge functions.
-- Run after supabase_step1_foundation.sql.

-- Drop only app RPCs that may already exist with a different return type.
-- Do not drop my_org_id(): existing RLS policies depend on it.
DROP FUNCTION IF EXISTS public.setup_new_organization(TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS public.get_org_name_for_invite(UUID);
DROP FUNCTION IF EXISTS public.join_organization(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.get_app_branding();
DROP FUNCTION IF EXISTS public.get_public_equipment_status(UUID);
DROP FUNCTION IF EXISTS public.get_upcoming_deadlines(INTEGER);
DROP FUNCTION IF EXISTS public.admin_get_org_members(UUID);
DROP FUNCTION IF EXISTS public.admin_set_plan(UUID, TEXT);
DROP FUNCTION IF EXISTS public.admin_extend_trial(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.admin_toggle_active(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.my_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$function$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT COALESCE((SELECT role = 'superadmin' FROM public.profiles WHERE id = auth.uid()), FALSE);
$function$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (SELECT role IN ('admin', 'superadmin')
       FROM public.profiles
      WHERE id = auth.uid()
        AND (role = 'superadmin' OR organization_id = p_org_id)),
    FALSE
  );
$function$;

CREATE OR REPLACE FUNCTION public.setup_new_organization(
  p_org_name TEXT,
  p_full_name TEXT,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_org_id UUID;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utente non valido');
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND organization_id IS NOT NULL) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utente gia collegato a una organizzazione');
  END IF;

  INSERT INTO public.organizations (name, plan, active, trial_expires_at)
  VALUES (COALESCE(NULLIF(TRIM(p_org_name), ''), 'Nuova organizzazione'), 'trial', TRUE, CURRENT_DATE + 30)
  RETURNING id INTO v_org_id;

  INSERT INTO public.profiles (id, organization_id, full_name, role)
  VALUES (p_user_id, v_org_id, NULLIF(TRIM(p_full_name), ''), 'admin')
  ON CONFLICT (id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        role = 'admin';

  RETURN jsonb_build_object('success', true, 'organization_id', v_org_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_org_name_for_invite(p_org_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (SELECT jsonb_build_object('id', id, 'name', name, 'city', city)
       FROM public.organizations
      WHERE id = p_org_id AND active = TRUE),
    jsonb_build_object('error', 'Organizzazione non trovata')
  );
$function$;

CREATE OR REPLACE FUNCTION public.join_organization(
  p_org_id UUID,
  p_user_id UUID,
  p_full_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_org_id AND active = TRUE) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organizzazione non valida o sospesa');
  END IF;

  IF p_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Utente non valido');
  END IF;

  INSERT INTO public.profiles (id, organization_id, full_name, role)
  VALUES (p_user_id, p_org_id, NULLIF(TRIM(p_full_name), ''), 'technician')
  ON CONFLICT (id) DO UPDATE
    SET organization_id = EXCLUDED.organization_id,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        role = CASE WHEN public.profiles.role = 'superadmin' THEN public.profiles.role ELSE 'technician' END;

  RETURN jsonb_build_object('success', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_app_branding()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
      'found', true,
      'name', name,
      'vat_number', vat_number,
      'address', address,
      'city', city,
      'phone', phone,
      'email', email
    )
    FROM public.organizations
    WHERE active = TRUE
    ORDER BY created_at
    LIMIT 1),
    jsonb_build_object('found', false)
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_public_equipment_status(p_equipment_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  WITH eq AS (
    SELECT e.* FROM public.equipment e WHERE e.id = p_equipment_id
  ),
  cl AS (
    SELECT c.* FROM public.clients c JOIN eq ON eq.client_id = c.id
  ),
  org AS (
    SELECT o.id, o.name, o.vat_number, o.address, o.city, o.phone, o.email, o.logo_url
    FROM public.organizations o JOIN cl ON cl.organization_id = o.id
  ),
  last_i AS (
    SELECT i.*, p.full_name AS technician_name
    FROM public.interventions i
    LEFT JOIN public.profiles p ON p.id = i.technician_id
    JOIN eq ON eq.client_id = i.client_id
    WHERE eq.type = ANY(i.equipment_types)
    ORDER BY i.date DESC, i.created_at DESC
    LIMIT 1
  ),
  next_s AS (
    SELECT s.*
    FROM public.schedules s
    JOIN eq ON eq.client_id = s.client_id AND eq.type = s.equipment_type
    WHERE s.status = 'scheduled'
    ORDER BY s.next_date ASC
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'equipment', (SELECT to_jsonb(eq) FROM eq),
    'client', (SELECT to_jsonb(cl) FROM cl),
    'organization', (SELECT to_jsonb(org) FROM org),
    'last_intervention', (SELECT to_jsonb(last_i) FROM last_i),
    'next_schedule', (SELECT to_jsonb(next_s) FROM next_s)
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_upcoming_deadlines(p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  org_id UUID,
  client_id UUID,
  client_name TEXT,
  equipment_type TEXT,
  maintenance_type TEXT,
  next_date DATE,
  days_left INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $function$
  SELECT
    s.organization_id,
    s.client_id,
    c.name,
    s.equipment_type,
    s.maintenance_type,
    s.next_date,
    (s.next_date - CURRENT_DATE)::INTEGER
  FROM public.schedules s
  JOIN public.clients c ON c.id = s.client_id
  JOIN public.organizations o ON o.id = s.organization_id
  WHERE o.active = TRUE
    AND s.status = 'scheduled'
    AND s.next_date BETWEEN CURRENT_DATE AND CURRENT_DATE + GREATEST(p_days, 0)
  ORDER BY s.organization_id, s.next_date;
$function$;

CREATE OR REPLACE FUNCTION public.admin_get_org_members(p_org_id UUID)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  role TEXT,
  cert_number TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT p.id, p.full_name, p.role, p.cert_number, p.phone, p.created_at
  FROM public.profiles p
  WHERE p.organization_id = p_org_id
  ORDER BY p.role, p.full_name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_set_plan(p_org_id UUID, p_plan TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF p_plan NOT IN ('trial', 'solo', 'starter', 'pro', 'agenzia') THEN
    RAISE EXCEPTION 'Invalid plan';
  END IF;

  UPDATE public.organizations
     SET plan = p_plan,
         active = TRUE,
         updated_at = NOW()
   WHERE id = p_org_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_extend_trial(p_org_id UUID, p_days INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.organizations
     SET trial_expires_at = GREATEST(COALESCE(trial_expires_at, CURRENT_DATE), CURRENT_DATE) + GREATEST(p_days, 0),
         active = TRUE,
         updated_at = NOW()
   WHERE id = p_org_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_toggle_active(p_org_id UUID, p_active BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.organizations
     SET active = p_active,
         updated_at = NOW()
   WHERE id = p_org_id;
END;
$function$;
