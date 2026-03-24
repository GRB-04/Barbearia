

## Plan: Barber Self-Service Chair Rental System

### Overview
Create a separate barber-facing experience where independent barbers can sign up, browse available stations across organizations, and book a chair for a specific day.

### Architecture

```text
Owner Flow (existing):        Barber Flow (new):
/locations, /barbers, etc.    /barber/auth → /barber/dashboard
                              /barber/browse → pick location → pick chair → pick date → confirm
```

Role detection: A new `barber_profiles` table links `auth.users` to barber accounts. On login, we check if the user has a `barber_profiles` row or an `organizations` row to route them to the correct experience.

### Database Changes (1 migration)

**1. `barber_profiles` table** -- self-registered barber accounts
- `id` (uuid, PK), `user_id` (uuid, references auth.users, unique, not null), `full_name` (text), `phone` (text), `email` (text), `created_at`, `updated_at`
- RLS: barbers can read/update their own profile

**2. `chair_bookings` table** -- daily chair rentals
- `id` (uuid, PK), `barber_profile_id` (uuid, FK to barber_profiles), `chair_id` (uuid, FK to chairs), `organization_id` (uuid, FK to organizations), `booking_date` (date, not null), `price` (numeric, default 0), `status` (enum: pending, confirmed, cancelled), `created_at`
- Unique constraint on `(chair_id, booking_date)` to prevent double-booking
- RLS: barbers can insert/view their own bookings; org owners can view bookings for their chairs

**3. New enum**: `booking_status` (pending, confirmed, cancelled)

**4. New RLS policies on `locations` and `chairs`**: Allow any authenticated user to SELECT (so barbers can browse available stations). Current policies restrict to org owners only.

### Frontend Changes

**Step 1: Barber Auth Page** (`src/pages/barber/BarberAuthPage.tsx`)
- Separate sign-up/login page styled for barbers (different branding/copy from owner auth)
- On sign-up, creates a `barber_profiles` row
- Route: `/barber/auth`

**Step 2: Barber Layout + Dashboard** (`src/components/BarberLayout.tsx`, `src/pages/barber/BarberDashboard.tsx`)
- Sidebar with: Dashboard, Browse Stations, My Bookings
- Dashboard shows upcoming bookings summary

**Step 3: Browse & Book Flow** (`src/pages/barber/BrowseStationsPage.tsx`)
- Step-by-step flow:
  1. List all active locations (across all organizations) with address/name
  2. Click a location to see its available chairs
  3. Click a chair to open a date picker (calendar showing available dates)
  4. Confirm booking for the selected date
- Chairs already booked on the selected date are shown as unavailable

**Step 4: My Bookings Page** (`src/pages/barber/MyBookingsPage.tsx`)
- Table/list of barber's bookings with date, location, chair, status
- Ability to cancel upcoming bookings

**Step 5: Update App.tsx routing**
- Add `/barber/*` routes outside the owner `AppLayout`
- Smart redirect: after auth, check if user has `barber_profiles` row -> barber dashboard, or `organizations` row -> owner dashboard
- `/barber/auth` is publicly accessible

### Technical Details

- The `useAuth` hook remains shared. A new `useBarberProfile` hook fetches the barber profile.
- App.tsx `AppRoutes` component will check both `organization` and `barberProfile` to decide routing.
- For browsing, barbers query `locations` (all active) and `chairs` (all available), then check `chair_bookings` for a given date to filter availability.
- The existing owner-managed `barbers` table stays independent from `barber_profiles` (they serve different purposes in this MVP).

