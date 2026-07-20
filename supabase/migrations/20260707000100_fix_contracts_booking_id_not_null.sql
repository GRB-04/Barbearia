-- Phase 1 gap fix: contracts.booking_id should be NOT NULL
-- The roadmap states: "contracts.booking_id uuid UNIQUE NOT NULL REFERENCES chair_bookings(id)"
-- The current schema has it as nullable. This migration removes orphan contracts and enforces the constraint.

-- Step 1: Delete any orphan contracts that have no booking (shouldn't exist, but clean up just in case)
DELETE FROM contracts WHERE booking_id IS NULL;

-- Step 2: Make booking_id NOT NULL
ALTER TABLE contracts
  ALTER COLUMN booking_id SET NOT NULL;

-- Step 3: Ensure the unique constraint exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'contracts_booking_id_key'
      AND conrelid = 'contracts'::regclass
  ) THEN
    ALTER TABLE contracts ADD CONSTRAINT contracts_booking_id_key UNIQUE (booking_id);
  END IF;
END $$;
