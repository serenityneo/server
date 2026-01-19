-- ============================================================================
-- MANUAL MIGRATION: Add Terms Acceptance Tracking
-- ============================================================================
-- Date: 2025-12-06
-- Purpose: Add terms acceptance fields to customers table
-- Safe to run multiple times (uses IF NOT EXISTS)
-- ============================================================================

-- Step 1: Check if columns already exist
DO $$ 
BEGIN
    -- Add terms_accepted column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customers' AND column_name = 'terms_accepted'
    ) THEN
        ALTER TABLE "customers" 
        ADD COLUMN "terms_accepted" boolean DEFAULT false NOT NULL;
        RAISE NOTICE 'Column terms_accepted added successfully';
    ELSE
        RAISE NOTICE 'Column terms_accepted already exists, skipping';
    END IF;

    -- Add terms_accepted_at column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customers' AND column_name = 'terms_accepted_at'
    ) THEN
        ALTER TABLE "customers" 
        ADD COLUMN "terms_accepted_at" timestamp(3);
        RAISE NOTICE 'Column terms_accepted_at added successfully';
    ELSE
        RAISE NOTICE 'Column terms_accepted_at already exists, skipping';
    END IF;

    -- Add terms_accepted_ip column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customers' AND column_name = 'terms_accepted_ip'
    ) THEN
        ALTER TABLE "customers" 
        ADD COLUMN "terms_accepted_ip" text;
        RAISE NOTICE 'Column terms_accepted_ip added successfully';
    ELSE
        RAISE NOTICE 'Column terms_accepted_ip already exists, skipping';
    END IF;
END $$;

-- Step 2: Add comments for documentation
COMMENT ON COLUMN "customers"."terms_accepted" IS 'Whether customer has accepted terms and conditions at KYC Step 4';
COMMENT ON COLUMN "customers"."terms_accepted_at" IS 'Timestamp when terms were accepted';
COMMENT ON COLUMN "customers"."terms_accepted_ip" IS 'IP address from which terms were accepted (audit trail)';

-- Step 3: Create index for quick lookup (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'idx_customers_terms_accepted'
    ) THEN
        CREATE INDEX "idx_customers_terms_accepted" 
        ON "customers" ("terms_accepted", "terms_accepted_at");
        RAISE NOTICE 'Index idx_customers_terms_accepted created successfully';
    ELSE
        RAISE NOTICE 'Index idx_customers_terms_accepted already exists, skipping';
    END IF;
END $$;

-- Step 4: Verify migration
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'customers'
  AND column_name IN ('terms_accepted', 'terms_accepted_at', 'terms_accepted_ip')
ORDER BY column_name;

-- Expected output:
--     column_name     |       data_type        | is_nullable | column_default 
-- --------------------+------------------------+-------------+----------------
--  terms_accepted     | boolean                | NO          | false
--  terms_accepted_at  | timestamp(3)           | YES         | NULL
--  terms_accepted_ip  | text                   | YES         | NULL

-- Step 5: Show sample data structure
SELECT 
    'Migration completed successfully!' as status,
    COUNT(*) as total_customers,
    COUNT(CASE WHEN terms_accepted = true THEN 1 END) as customers_accepted_terms
FROM customers;
