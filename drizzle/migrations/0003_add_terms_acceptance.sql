-- Migration: Add terms acceptance tracking to customers table
-- Created: 2025-12-06
-- Purpose: Track when customers accept terms and conditions during KYC Step 4

ALTER TABLE "customers" 
ADD COLUMN IF NOT EXISTS "terms_accepted" boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS "terms_accepted_at" timestamp(3),
ADD COLUMN IF NOT EXISTS "terms_accepted_ip" text;

-- Add comment for documentation
COMMENT ON COLUMN "customers"."terms_accepted" IS 'Whether customer has accepted terms and conditions';
COMMENT ON COLUMN "customers"."terms_accepted_at" IS 'Timestamp when terms were accepted';
COMMENT ON COLUMN "customers"."terms_accepted_ip" IS 'IP address from which terms were accepted';

-- Create index for quick lookup of customers who accepted terms
CREATE INDEX IF NOT EXISTS "idx_customers_terms_accepted" ON "customers" ("terms_accepted", "terms_accepted_at");
