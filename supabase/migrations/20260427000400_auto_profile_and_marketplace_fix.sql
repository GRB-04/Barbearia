
-- ============================================================
-- FIX: AUTOMATIC BARBER PROFILE AND RLS STABILIZATION
-- ============================================================

-- 1. Ensure barber_profiles can be created by the user upon signup
-- If the session isn't fully established yet, we'll use a trigger
-- but we also need to make sure the policy allows it.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- We only create a barber_profile if it doesn't exist.
  -- This handles both public signup and invite-link signup.
  INSERT INTO public.barber_profiles (user_id, full_name, email)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email, 'Barbeiro'),
    new.email
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Fix the bind_barber_profile_to_org to be SECURITY DEFINER
-- This is critical so that the trigger can update the 'barbers' table
-- even when the user doing the signup doesn't have permissions yet.

CREATE OR REPLACE FUNCTION public.bind_barber_profile_to_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_barber_id uuid;
  v_org_id uuid;
BEGIN
  IF new.email IS NULL THEN
    RETURN new;
  END IF;

  -- Find an internal barber record with the same email
  SELECT b.id, b.organization_id
    INTO v_barber_id, v_org_id
  FROM public.barbers b
  WHERE b.email IS NOT NULL
    AND LOWER(TRIM(b.email)) = LOWER(TRIM(new.email))
  ORDER BY b.created_at ASC
  LIMIT 1;

  -- If found, bind the profile to that organization
  IF v_org_id IS NOT NULL THEN
    new.organization_id := v_org_id;
  END IF;

  -- Also update the internal record to point to this profile
  IF v_barber_id IS NOT NULL THEN
    UPDATE public.barbers
    SET barber_profile_id = new.id
    WHERE id = v_barber_id
      AND (barber_profile_id IS DISTINCT FROM new.id);
  END IF;

  RETURN new;
END;
$$;

-- 3. Open up Locations and Chairs for Public Browsing (Marketplace Model)
-- This allows any authenticated barber to see any chair to book it.

DROP POLICY IF EXISTS "locations_select_owner_or_barber_same_org" ON public.locations;
DROP POLICY IF EXISTS "locations_select_public" ON public.locations;
CREATE POLICY "locations_select_public"
ON public.locations FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "chairs_select_owner_or_barber_same_org" ON public.chairs;
DROP POLICY IF EXISTS "chairs_select_public" ON public.chairs;
CREATE POLICY "chairs_select_public"
ON public.chairs FOR SELECT
TO authenticated
USING (true);

-- 4. Ensure Barber Profiles can be updated by the owner if they are in the same org
-- (Optional but helpful for management)
DROP POLICY IF EXISTS "barber_profiles_select_owner" ON public.barber_profiles;
CREATE POLICY "barber_profiles_select_owner"
ON public.barber_profiles FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT id FROM public.organizations WHERE owner_id = auth.uid()
  )
);

-- 5. BACKFILL: Create profiles for existing users who don't have one
INSERT INTO public.barber_profiles (user_id, full_name, email)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'full_name', email, 'Barbeiro'),
  email
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM public.barber_profiles bp WHERE bp.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

