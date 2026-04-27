-- ============================================================
-- Fix 1: Add missing RLS policies for barber_clients table
-- Fix 2: Ensure barber_clients has the correct table structure
-- ============================================================

-- Create the table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS public.barber_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  barber_profile_id uuid NOT NULL REFERENCES public.barber_profiles(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  email text,
  first_appointment_date timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.barber_clients ENABLE ROW LEVEL SECURITY;

-- Barbeiro pode ver seus próprios clientes
DROP POLICY IF EXISTS "barber_clients_select" ON public.barber_clients;
CREATE POLICY "barber_clients_select"
ON public.barber_clients FOR SELECT
TO authenticated
USING (
  barber_profile_id IN (
    SELECT id FROM public.barber_profiles WHERE user_id = auth.uid()
  )
  OR
  organization_id IN (
    SELECT id FROM public.organizations WHERE owner_id = auth.uid()
  )
);

-- Barbeiro pode inserir clientes vinculados ao seu perfil
DROP POLICY IF EXISTS "barber_clients_insert" ON public.barber_clients;
CREATE POLICY "barber_clients_insert"
ON public.barber_clients FOR INSERT
TO authenticated
WITH CHECK (
  barber_profile_id IN (
    SELECT id FROM public.barber_profiles WHERE user_id = auth.uid()
  )
);

-- Barbeiro pode atualizar seus próprios clientes
DROP POLICY IF EXISTS "barber_clients_update" ON public.barber_clients;
CREATE POLICY "barber_clients_update"
ON public.barber_clients FOR UPDATE
TO authenticated
USING (
  barber_profile_id IN (
    SELECT id FROM public.barber_profiles WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  barber_profile_id IN (
    SELECT id FROM public.barber_profiles WHERE user_id = auth.uid()
  )
);

-- Barbeiro pode deletar seus próprios clientes
DROP POLICY IF EXISTS "barber_clients_delete" ON public.barber_clients;
CREATE POLICY "barber_clients_delete"
ON public.barber_clients FOR DELETE
TO authenticated
USING (
  barber_profile_id IN (
    SELECT id FROM public.barber_profiles WHERE user_id = auth.uid()
  )
);

-- ============================================================
-- Fix 3: RLS policies for check_ins (if missing)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  barber_profile_id uuid NOT NULL REFERENCES public.barber_profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.barber_clients(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'waiting',
  checked_in_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  duration_minutes numeric,
  service_amount numeric,
  service_notes text,
  commission_type text,
  commission_value numeric,
  commission_amount numeric,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "check_ins_select" ON public.check_ins;
CREATE POLICY "check_ins_select"
ON public.check_ins FOR SELECT
TO authenticated
USING (
  barber_profile_id IN (
    SELECT id FROM public.barber_profiles WHERE user_id = auth.uid()
  )
  OR
  organization_id IN (
    SELECT id FROM public.organizations WHERE owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "check_ins_insert" ON public.check_ins;
CREATE POLICY "check_ins_insert"
ON public.check_ins FOR INSERT
TO authenticated
WITH CHECK (
  barber_profile_id IN (
    SELECT id FROM public.barber_profiles WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "check_ins_update" ON public.check_ins;
CREATE POLICY "check_ins_update"
ON public.check_ins FOR UPDATE
TO authenticated
USING (
  barber_profile_id IN (
    SELECT id FROM public.barber_profiles WHERE user_id = auth.uid()
  )
  OR
  organization_id IN (
    SELECT id FROM public.organizations WHERE owner_id = auth.uid()
  )
);
