
-- Enum for booking status
CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'cancelled');

-- Barber profiles (self-registered barbers)
CREATE TABLE public.barber_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);

ALTER TABLE public.barber_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Barbers can view own profile" ON public.barber_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Barbers can update own profile" ON public.barber_profiles
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Barbers can insert own profile" ON public.barber_profiles
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Chair bookings (daily rentals)
CREATE TABLE public.chair_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_profile_id uuid REFERENCES public.barber_profiles(id) ON DELETE CASCADE NOT NULL,
  chair_id uuid REFERENCES public.chairs(id) ON DELETE CASCADE NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  booking_date date NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  status booking_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chair_id, booking_date)
);

ALTER TABLE public.chair_bookings ENABLE ROW LEVEL SECURITY;

-- Barbers can view their own bookings
CREATE POLICY "Barbers can view own bookings" ON public.chair_bookings
  FOR SELECT TO authenticated USING (
    barber_profile_id IN (SELECT id FROM public.barber_profiles WHERE user_id = auth.uid())
  );

-- Barbers can insert their own bookings
CREATE POLICY "Barbers can insert own bookings" ON public.chair_bookings
  FOR INSERT TO authenticated WITH CHECK (
    barber_profile_id IN (SELECT id FROM public.barber_profiles WHERE user_id = auth.uid())
  );

-- Barbers can update (cancel) their own bookings
CREATE POLICY "Barbers can update own bookings" ON public.chair_bookings
  FOR UPDATE TO authenticated USING (
    barber_profile_id IN (SELECT id FROM public.barber_profiles WHERE user_id = auth.uid())
  );

-- Org owners can view bookings for their chairs
CREATE POLICY "Owners can view chair bookings" ON public.chair_bookings
  FOR SELECT TO authenticated USING (
    organization_id IN (SELECT id FROM public.organizations WHERE owner_id = auth.uid())
  );

-- Allow any authenticated user to browse locations (read-only)
CREATE POLICY "Authenticated users can browse locations" ON public.locations
  FOR SELECT TO authenticated USING (status = 'active');

-- Allow any authenticated user to browse chairs (read-only)
CREATE POLICY "Authenticated users can browse chairs" ON public.chairs
  FOR SELECT TO authenticated USING (true);

-- Allow any authenticated user to browse organizations (read-only, for display)
CREATE POLICY "Authenticated users can browse organizations" ON public.organizations
  FOR SELECT TO authenticated USING (true);
