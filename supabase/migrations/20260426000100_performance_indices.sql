-- ÍNDICE 1: user_id em barber_profiles (CRÍTICO para Auth/Profile lookups)
CREATE INDEX IF NOT EXISTS idx_barber_profiles_user_id 
  ON public.barber_profiles(user_id);

-- ÍNDICE 2: Performance em chair_bookings (Filtros por cadeira e data)
CREATE INDEX IF NOT EXISTS idx_chair_bookings_chair_dates 
  ON public.chair_bookings(chair_id, start_at DESC, end_at DESC);

-- ÍNDICE 3: Busca de barbeiros por email (Insensitive)
CREATE INDEX IF NOT EXISTS idx_barbers_email_lower 
  ON public.barbers(LOWER(email));

-- ÍNDICE 4: Performance em chairs (Lookups por localização)
CREATE INDEX IF NOT EXISTS idx_chairs_location_id 
  ON public.chairs(location_id);
