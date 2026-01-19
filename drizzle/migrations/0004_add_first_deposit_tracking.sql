-- Migration: Add First Deposit Tracking for Partner Commissions
-- Created: 2025-12-09
-- Description: Add fields to customers table to track first deposits
--              and enable commission awards to partners

-- Add first deposit tracking columns to customers table
ALTER TABLE "customers" 
  ADD COLUMN IF NOT EXISTS "first_deposit_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "first_deposit_amount" NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS "first_deposit_commission_awarded" BOOLEAN NOT NULL DEFAULT false;

-- Create default commission configuration for first deposits (if doesn't exist)
INSERT INTO commission_configurations (
    operation_type, 
    commission_amount_usd, 
    commission_amount_cdf,
    description,
    created_by,
    is_active
) 
SELECT 
    'DEPOSIT',
    1.50,
    3000.00,
    'Commission for member first deposit (automatically awarded when member makes first deposit)',
    1,
    true
WHERE NOT EXISTS (
    SELECT 1 FROM commission_configurations 
    WHERE operation_type = 'DEPOSIT'
);

-- Create index for first deposit queries
CREATE INDEX IF NOT EXISTS "customers_first_deposit_date_idx" 
    ON "customers" ("first_deposit_date");

CREATE INDEX IF NOT EXISTS "customers_managed_by_partner_first_deposit_idx" 
    ON "customers" ("managed_by_partner_id", "first_deposit_date")
    WHERE "first_deposit_date" IS NOT NULL;

-- Function to check if customer has made first deposit
CREATE OR REPLACE FUNCTION has_made_first_deposit(customer_id_param INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM customers 
        WHERE id = customer_id_param 
          AND first_deposit_date IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql;

-- Function to get partner first deposit statistics
CREATE OR REPLACE FUNCTION get_partner_first_deposit_stats(partner_id_param INTEGER)
RETURNS TABLE(
    total_members_created INTEGER,
    members_with_first_deposit INTEGER,
    total_commissions_awarded INTEGER,
    pending_first_deposits INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_members_created,
        COUNT(CASE WHEN first_deposit_date IS NOT NULL THEN 1 END)::INTEGER as members_with_first_deposit,
        COUNT(CASE WHEN first_deposit_commission_awarded = true THEN 1 END)::INTEGER as total_commissions_awarded,
        COUNT(CASE WHEN first_deposit_date IS NOT NULL AND first_deposit_commission_awarded = false THEN 1 END)::INTEGER as pending_first_deposits
    FROM customers
    WHERE managed_by_partner_id = partner_id_param;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN customers.first_deposit_date IS 'Date when customer made their first deposit (for partner commission tracking)';
COMMENT ON COLUMN customers.first_deposit_amount IS 'Amount of the first deposit made by customer';
COMMENT ON COLUMN customers.first_deposit_commission_awarded IS 'Whether commission has been awarded to the partner who created this customer';
COMMENT ON FUNCTION has_made_first_deposit IS 'Check if a customer has made their first deposit';
COMMENT ON FUNCTION get_partner_first_deposit_stats IS 'Get statistics on first deposits for a partner';
