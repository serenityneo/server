-- Migration: Add columns for manual member migration system
-- Date: 2026-01-03
-- Description: Adds passwordChangedAfterCreation and terms acceptance columns to customers table

-- Add password change tracking column
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "password_changed_after_creation" BOOLEAN DEFAULT false NOT NULL;

-- Add terms acceptance columns (if not exist)
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "terms_accepted" BOOLEAN DEFAULT false NOT NULL;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "terms_accepted_at" TIMESTAMP(3);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "terms_accepted_ip" TEXT;

-- Create index for manual creation lookup
CREATE INDEX IF NOT EXISTS "customers_is_manual_creation_idx" ON "customers" ("is_manual_creation");

-- Create index for password change tracking
CREATE INDEX IF NOT EXISTS "customers_password_changed_idx" ON "customers" ("password_changed_after_creation");

-- Comment for documentation
COMMENT ON COLUMN "customers"."password_changed_after_creation" IS 'Tracks if user has changed password after admin-created account first login';
COMMENT ON COLUMN "customers"."terms_accepted" IS 'Whether user has digitally accepted terms and conditions';
COMMENT ON COLUMN "customers"."terms_accepted_at" IS 'Timestamp when user accepted terms';
COMMENT ON COLUMN "customers"."terms_accepted_ip" IS 'IP address from which user accepted terms';
