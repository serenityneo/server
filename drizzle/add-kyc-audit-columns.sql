-- Migration: Add KYC Audit Trail Columns
-- Date: 2025-12-30
-- Purpose: Add complete traceability for KYC validation process (Banking compliance)

-- Add traceability columns
ALTER TABLE customers 
  ADD COLUMN IF NOT EXISTS validated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_modified_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejection_notes TEXT,
  ADD COLUMN IF NOT EXISTS admin_notes TEXT,
  ADD COLUMN IF NOT EXISTS kyc_audit_trail JSONB DEFAULT '[]'::jsonb;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_validated_by ON customers(validated_by_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_rejected_by ON customers(rejected_by_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_last_modified_by ON customers(last_modified_by_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_kyc_audit_trail ON customers USING GIN(kyc_audit_trail);

-- Add comments for documentation
COMMENT ON COLUMN customers.validated_by_user_id IS 'ID of admin user who validated the KYC';
COMMENT ON COLUMN customers.rejected_by_user_id IS 'ID of admin user who rejected the KYC';
COMMENT ON COLUMN customers.last_modified_by_user_id IS 'ID of admin user who last modified customer data';
COMMENT ON COLUMN customers.rejection_reason IS 'Reason for KYC rejection (visible to customer)';
COMMENT ON COLUMN customers.rejection_notes IS 'Internal notes for rejection (admin only)';
COMMENT ON COLUMN customers.admin_notes IS 'General admin notes about this customer';
COMMENT ON COLUMN customers.kyc_audit_trail IS 'Complete audit trail: [{action, userId, userName, timestamp, details}]';

-- Banking compliance: Ensure audit trail integrity
-- Create trigger function to track modifications
CREATE OR REPLACE FUNCTION customers_kyc_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Only track KYC-related changes
  IF (OLD.kyc_status IS DISTINCT FROM NEW.kyc_status) OR
     (OLD.validated_by_user_id IS DISTINCT FROM NEW.validated_by_user_id) OR
     (OLD.rejected_by_user_id IS DISTINCT FROM NEW.rejected_by_user_id) THEN
    
    -- Append audit trail entry
    NEW.kyc_audit_trail = COALESCE(NEW.kyc_audit_trail, '[]'::jsonb) || 
      jsonb_build_object(
        'timestamp', NOW(),
        'action', 
          CASE 
            WHEN NEW.kyc_status = 'KYC1_COMPLETED' THEN 'KYC1_VALIDATED'
            WHEN NEW.kyc_status = 'KYC2_VERIFIED' THEN 'KYC2_VALIDATED'
            WHEN NEW.kyc_status = 'REJECTED' THEN 'KYC_REJECTED'
            ELSE 'KYC_STATUS_CHANGED'
          END,
        'old_status', OLD.kyc_status,
        'new_status', NEW.kyc_status,
        'validated_by', NEW.validated_by_user_id,
        'rejected_by', NEW.rejected_by_user_id
      );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS customers_kyc_audit_trail_trigger ON customers;
CREATE TRIGGER customers_kyc_audit_trail_trigger
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION customers_kyc_audit_trigger();

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'KYC Audit Trail columns added successfully. Banking compliance: ENABLED';
END $$;
