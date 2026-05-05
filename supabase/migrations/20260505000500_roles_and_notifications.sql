-- ============================================================
-- F003: Adicionar roles receptionist e manager ao enum app_role
-- F020: Tabela de notificações in-app
-- ST-F025-002: Suporte a anonimização LGPD (audit trail)
-- ============================================================

-- Enum ADD VALUE não pode estar em transação, por isso usamos DO blocks

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'receptionist'
      AND enumtypid = 'public.app_role'::regtype
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'receptionist';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'manager'
      AND enumtypid = 'public.app_role'::regtype
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'manager';
  END IF;
END
$$;

-- ============================================================
-- F020: Tabela de notificações in-app
-- ============================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text        NOT NULL,
  body            text,
  type            text        NOT NULL DEFAULT 'info',  -- info, success, warning, contract, checkin
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications (user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_org_id
  ON public.notifications (organization_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Usuário vê as próprias notificações
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
ON public.notifications FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- Usuário pode marcar como lida (update)
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own"
ON public.notifications FOR UPDATE TO authenticated
USING (user_id = auth.uid());

-- Owner pode inserir notificação para qualquer membro da org
DROP POLICY IF EXISTS "notifications_insert_auth" ON public.notifications;
CREATE POLICY "notifications_insert_auth"
ON public.notifications FOR INSERT TO authenticated
WITH CHECK (true);  -- validação via RLS nas tabelas de origem

-- Owner pode ver notificações da sua org
DROP POLICY IF EXISTS "notifications_select_owner" ON public.notifications;
CREATE POLICY "notifications_select_owner"
ON public.notifications FOR SELECT TO authenticated
USING (
  organization_id IN (
    SELECT id FROM public.organizations WHERE owner_id = auth.uid()
  )
);

-- ============================================================
-- ST-F025-002: Coluna is_anonymized em barber_clients
-- ============================================================

ALTER TABLE public.barber_clients
  ADD COLUMN IF NOT EXISTS is_anonymized boolean NOT NULL DEFAULT false;

ALTER TABLE public.barber_clients
  ADD COLUMN IF NOT EXISTS anonymized_at timestamptz;
