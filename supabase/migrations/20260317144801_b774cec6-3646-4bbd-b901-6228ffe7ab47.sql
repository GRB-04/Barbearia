
-- Enable RLS on all tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chairs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Organizations: owner can do everything
CREATE POLICY "Owner can view own organizations"
ON public.organizations FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Owner can insert organizations"
ON public.organizations FOR INSERT
TO authenticated
WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Owner can update own organizations"
ON public.organizations FOR UPDATE
TO authenticated
USING (owner_id = auth.uid());

CREATE POLICY "Owner can delete own organizations"
ON public.organizations FOR DELETE
TO authenticated
USING (owner_id = auth.uid());

-- Locations: accessible by org owner
CREATE POLICY "Owner can view locations"
ON public.locations FOR SELECT
TO authenticated
USING (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can insert locations"
ON public.locations FOR INSERT
TO authenticated
WITH CHECK (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can update locations"
ON public.locations FOR UPDATE
TO authenticated
USING (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can delete locations"
ON public.locations FOR DELETE
TO authenticated
USING (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

-- Chairs: accessible by org owner via location
CREATE POLICY "Owner can view chairs"
ON public.chairs FOR SELECT
TO authenticated
USING (location_id IN (
  SELECT l.id FROM public.locations l
  JOIN public.organizations o ON l.organization_id = o.id
  WHERE o.owner_id = auth.uid()
));

CREATE POLICY "Owner can insert chairs"
ON public.chairs FOR INSERT
TO authenticated
WITH CHECK (location_id IN (
  SELECT l.id FROM public.locations l
  JOIN public.organizations o ON l.organization_id = o.id
  WHERE o.owner_id = auth.uid()
));

CREATE POLICY "Owner can update chairs"
ON public.chairs FOR UPDATE
TO authenticated
USING (location_id IN (
  SELECT l.id FROM public.locations l
  JOIN public.organizations o ON l.organization_id = o.id
  WHERE o.owner_id = auth.uid()
));

CREATE POLICY "Owner can delete chairs"
ON public.chairs FOR DELETE
TO authenticated
USING (location_id IN (
  SELECT l.id FROM public.locations l
  JOIN public.organizations o ON l.organization_id = o.id
  WHERE o.owner_id = auth.uid()
));

-- Barbers: accessible by org owner
CREATE POLICY "Owner can view barbers"
ON public.barbers FOR SELECT
TO authenticated
USING (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can insert barbers"
ON public.barbers FOR INSERT
TO authenticated
WITH CHECK (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can update barbers"
ON public.barbers FOR UPDATE
TO authenticated
USING (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can delete barbers"
ON public.barbers FOR DELETE
TO authenticated
USING (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

-- Contracts: accessible by org owner
CREATE POLICY "Owner can view contracts"
ON public.contracts FOR SELECT
TO authenticated
USING (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can insert contracts"
ON public.contracts FOR INSERT
TO authenticated
WITH CHECK (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can update contracts"
ON public.contracts FOR UPDATE
TO authenticated
USING (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can delete contracts"
ON public.contracts FOR DELETE
TO authenticated
USING (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

-- Payments: accessible by org owner
CREATE POLICY "Owner can view payments"
ON public.payments FOR SELECT
TO authenticated
USING (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can insert payments"
ON public.payments FOR INSERT
TO authenticated
WITH CHECK (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));

CREATE POLICY "Owner can update payments"
ON public.payments FOR UPDATE
TO authenticated
USING (organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid()));
