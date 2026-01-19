-- Migration: Update accounts table schema and harmonize account types
-- Created: 2025-12-23
-- Description: Add account_type_code, cif fields and ensure account_types are properly seeded

-- ============================================================================
-- STEP 1: Add new columns to accounts table
-- ============================================================================
ALTER TABLE "accounts" 
  ADD COLUMN IF NOT EXISTS "account_type_code" text,
  ADD COLUMN IF NOT EXISTS "cif" varchar(8);

-- ============================================================================
-- STEP 2: Ensure account_types table has all 6 types (S01-S06)
-- ============================================================================
-- Note: account_types has a composite unique key (code, currency)
-- We need to insert 12 rows: 6 types × 2 currencies

-- S01 - Compte Standard
INSERT INTO account_types (code, label, description, currency, default_status, allowed_currencies)
VALUES 
  ('S01', 'Compte Standard', 'Compte courant pour dépôts et retraits réguliers', 'CDF', 'ACTIVE', ARRAY['CDF','USD']:"Currency"[]),
  ('S01', 'Compte Standard', 'Compte courant pour dépôts et retraits réguliers', 'USD', 'ACTIVE', ARRAY['CDF','USD']:"Currency"[])
ON CONFLICT (code, currency) 
DO UPDATE SET 
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_status = EXCLUDED.default_status,
  allowed_currencies = EXCLUDED.allowed_currencies,
  updated_at = CURRENT_TIMESTAMP;

-- S02 - Épargne Obligatoire
INSERT INTO account_types (code, label, description, currency, default_status, allowed_currencies)
VALUES 
  ('S02', 'Épargne Obligatoire', 'Compte d''épargne conditionnant l''éligibilité aux crédits', 'CDF', 'INACTIVE', ARRAY['CDF','USD']:"Currency"[]),
  ('S02', 'Épargne Obligatoire', 'Compte d''épargne conditionnant l''éligibilité aux crédits', 'USD', 'INACTIVE', ARRAY['CDF','USD']:"Currency"[])
ON CONFLICT (code, currency) 
DO UPDATE SET 
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_status = EXCLUDED.default_status,
  allowed_currencies = EXCLUDED.allowed_currencies,
  updated_at = CURRENT_TIMESTAMP;

-- S03 - Caution
INSERT INTO account_types (code, label, description, currency, default_status, allowed_currencies)
VALUES 
  ('S03', 'Caution', 'Garantie financière associée aux crédits', 'CDF', 'INACTIVE', ARRAY['CDF','USD']:"Currency"[]),
  ('S03', 'Caution', 'Garantie financière associée aux crédits', 'USD', 'INACTIVE', ARRAY['CDF','USD']:"Currency"[])
ON CONFLICT (code, currency) 
DO UPDATE SET 
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_status = EXCLUDED.default_status,
  allowed_currencies = EXCLUDED.allowed_currencies,
  updated_at = CURRENT_TIMESTAMP;

-- S04 - Crédit
INSERT INTO account_types (code, label, description, currency, default_status, allowed_currencies)
VALUES 
  ('S04', 'Crédit', 'Compte crédité à l''octroi et débité aux remboursements', 'CDF', 'INACTIVE', ARRAY['CDF','USD']:"Currency"[]),
  ('S04', 'Crédit', 'Compte crédité à l''octroi et débité aux remboursements', 'USD', 'INACTIVE', ARRAY['CDF','USD']:"Currency"[])
ON CONFLICT (code, currency) 
DO UPDATE SET 
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_status = EXCLUDED.default_status,
  allowed_currencies = EXCLUDED.allowed_currencies,
  updated_at = CURRENT_TIMESTAMP;

-- S05 - Bwakisa Carte
INSERT INTO account_types (code, label, description, currency, default_status, allowed_currencies)
VALUES 
  ('S05', 'Bwakisa Carte', 'Service d''assistance pour épargne régulière (objectif/maturité)', 'CDF', 'INACTIVE', ARRAY['CDF','USD']:"Currency"[]),
  ('S05', 'Bwakisa Carte', 'Service d''assistance pour épargne régulière (objectif/maturité)', 'USD', 'INACTIVE', ARRAY['CDF','USD']:"Currency"[])
ON CONFLICT (code, currency) 
DO UPDATE SET 
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_status = EXCLUDED.default_status,
  allowed_currencies = EXCLUDED.allowed_currencies,
  updated_at = CURRENT_TIMESTAMP;

-- S06 - Amendes
INSERT INTO account_types (code, label, description, currency, default_status, allowed_currencies)
VALUES 
  ('S06', 'Amendes', 'Paiement des amendes liées aux engagements de crédit', 'CDF', 'INACTIVE', ARRAY['CDF','USD']:"Currency"[]),
  ('S06', 'Amendes', 'Paiement des amendes liées aux engagements de crédit', 'USD', 'INACTIVE', ARRAY['CDF','USD']:"Currency"[])
ON CONFLICT (code, currency) 
DO UPDATE SET 
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_status = EXCLUDED.default_status,
  allowed_currencies = EXCLUDED.allowed_currencies,
  updated_at = CURRENT_TIMESTAMP;

-- ============================================================================
-- STEP 3: Populate account_type_configurations (if exists)
-- ============================================================================
-- This table might not exist in all environments, so we check first
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'account_type_configurations') THEN
    
    INSERT INTO account_type_configurations (code, label, description, allowed_currencies, default_status, is_active)
    VALUES 
      ('S01', 'Compte Standard', 'Compte courant pour dépôts et retraits réguliers', ARRAY['CDF','USD'], 'ACTIVE', true),
      ('S02', 'Épargne Obligatoire', 'Compte d''épargne conditionnant l''éligibilité aux crédits', ARRAY['CDF','USD'], 'INACTIVE', true),
      ('S03', 'Caution', 'Garantie financière associée aux crédits', ARRAY['CDF','USD'], 'INACTIVE', true),
      ('S04', 'Crédit', 'Compte crédité à l''octroi et débité aux remboursements', ARRAY['CDF','USD'], 'INACTIVE', true),
      ('S05', 'Bwakisa Carte', 'Service d''assistance pour épargne régulière', ARRAY['CDF','USD'], 'INACTIVE', true),
      ('S06', 'Amendes', 'Paiement des amendes liées aux engagements de crédit', ARRAY['CDF','USD'], 'INACTIVE', true)
    ON CONFLICT (code) 
    DO UPDATE SET 
      label = EXCLUDED.label,
      description = EXCLUDED.description,
      allowed_currencies = EXCLUDED.allowed_currencies,
      default_status = EXCLUDED.default_status,
      is_active = EXCLUDED.is_active,
      updated_at = CURRENT_TIMESTAMP;
      
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Migrate existing data from account_type to account_type_code
-- ============================================================================
UPDATE "accounts" 
SET "account_type_code" = 
  CASE 
    WHEN account_type = 'S01_STANDARD' THEN 'S01'
    WHEN account_type = 'S02_MANDATORY_SAVINGS' THEN 'S02'
    WHEN account_type = 'S03_CAUTION' THEN 'S03'
    WHEN account_type = 'S04_CREDIT' THEN 'S04'
    WHEN account_type = 'S05_BWAKISA_CARTE' THEN 'S05'
    WHEN account_type = 'S06_FINES' THEN 'S06'
    WHEN account_type = 'S01' THEN 'S01'
    WHEN account_type = 'S02' THEN 'S02'
    WHEN account_type = 'S03' THEN 'S03'
    WHEN account_type = 'S04' THEN 'S04'
    WHEN account_type = 'S05' THEN 'S05'
    WHEN account_type = 'S06' THEN 'S06'
    ELSE account_type
  END
WHERE "account_type_code" IS NULL AND "account_type" IS NOT NULL;

-- ============================================================================
-- STEP 5: Populate CIF from customers table
-- ============================================================================
UPDATE "accounts" a
SET "cif" = c.cif
FROM "customers" c
WHERE a.customer_id = c.id 
  AND c.cif IS NOT NULL 
  AND a.cif IS NULL;

-- ============================================================================
-- STEP 6: Add indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS "accounts_account_type_code_idx" 
  ON "accounts" USING btree ("account_type_code");

CREATE INDEX IF NOT EXISTS "accounts_cif_idx" 
  ON "accounts" USING btree ("cif");

CREATE INDEX IF NOT EXISTS "accounts_customer_id_account_type_code_idx"
  ON "accounts" USING btree ("customer_id", "account_type_code");

CREATE INDEX IF NOT EXISTS "accounts_cif_customer_id_idx"
  ON "accounts" USING btree ("cif", "customer_id");

CREATE INDEX IF NOT EXISTS "accounts_currency_status_idx"
  ON "accounts" USING btree ("currency", "status");

-- ============================================================================
-- STEP 7: Add check constraint for account_type_code values
-- ============================================================================
ALTER TABLE "accounts" 
  DROP CONSTRAINT IF EXISTS "accounts_account_type_code_check";

ALTER TABLE "accounts" 
  ADD CONSTRAINT "accounts_account_type_code_check" 
  CHECK ("account_type_code" IN ('S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'SAVINGS', 'CURRENT', 'CREDIT', 'MOBILE_MONEY'));

-- ============================================================================
-- STEP 8: Add comments for documentation
-- ============================================================================
COMMENT ON COLUMN "accounts"."account_type_code" IS 'Account type code: S01-S06 for core banking types, or SAVINGS/CURRENT/CREDIT/MOBILE_MONEY';
COMMENT ON COLUMN "accounts"."cif" IS 'Customer Information File number (8 digits) - links to customers.cif';
COMMENT ON INDEX "accounts_customer_id_account_type_code_idx" IS 'Composite index for quickly finding customer accounts by type';
COMMENT ON TABLE "account_types" IS 'Catalog of account types - 12 rows (6 types × 2 currencies)';
COMMENT ON INDEX "accounts_currency_status_idx" IS 'Index for filtering accounts by currency and status';

-- ============================================================================
-- STEP 9: Verification queries (for manual check)
-- ============================================================================
-- Run these queries after migration to verify everything is correct:

-- Check account_types count (should be 12: 6 types × 2 currencies)
-- SELECT code, currency, label, default_status FROM account_types ORDER BY code, currency;

-- Check accounts with account_type_code
-- SELECT COUNT(*) as total, 
--        COUNT(account_type_code) as with_code,
--        COUNT(cif) as with_cif
-- FROM accounts;

-- Check for any unmigrated account_type values
-- SELECT DISTINCT account_type 
-- FROM accounts 
-- WHERE account_type_code IS NULL;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
