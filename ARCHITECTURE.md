# Architecture

## Core concepts

| Concept | Table | Who creates it |
|---------|-------|----------------|
| A barber (person) | `barber_profiles` | The barber, on sign-up via invite link |
| A roster entry (per org) | `organization_barbers` | The owner, before the barber signs up |
| A rental | `chair_bookings` | The barber, via self-service booking |
| A contract | `contracts` | A DB trigger, when a booking is confirmed |

## Identity: two tables, one person

`barber_profiles` is the **global account** — one row per person, linked to `auth.users`. This is the actor who logs in and rents chairs.

`organization_barbers` is the **per-org roster entry** — one row per (org, barber) pair. It is created by the owner when they add someone to their shop. When the barber claims the invite, `claim_barber_invitation()` links the roster entry to the new `barber_profiles` row via `barber_profile_id`.

`barber_profiles.organization_id` is nullable: `NULL` means a global self-signup barber; a value means the barber was invited by that org. Cross-org renting is driven by `chair_bookings.organization_id`, never the profile's own org field.

## Rental spine

`chair_bookings` is **the rental**. Every chair rental is exactly one row here.

`contracts` is a **child of a booking** (1:1, `booking_id UNIQUE NOT NULL`). It is created automatically by a trigger when a booking transitions to `confirmed`, and voided (status flipped to `voided`) when a booking is cancelled or rejected. Contracts are never deleted — they are legal records.

## Booking confirmation flow

1. Barber books a chair → `chair_bookings` row created with status `pending`.
2. Resolution rule: `COALESCE(location.auto_confirm_bookings, org.auto_confirm_bookings)`.
   - If `true` → booking is immediately set to `confirmed` and a contract is auto-created.
   - If `false` → booking stays `pending` until the owner approves.
3. Owner approval → status → `confirmed` → trigger creates the contract.
4. Cancel/reject → status → `cancelled`/`rejected` → trigger voids the contract.

## Two apps, one codebase

- Owner/Admin portal: routes under `/*`
- Barber portal: routes under `/barber/*`

Both talk directly to Supabase (PostgreSQL + Auth + RLS). No custom API server. Query logic lives in `src/services/*.ts`.

## Tech stack

- React 18 + TypeScript + Vite
- Tailwind + shadcn/ui
- React Router + React Query
- Supabase (PostgreSQL + Auth + RLS)
