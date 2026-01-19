/**
 * Migration Script: Add KYC Audit Trail Columns
 * Date: 2025-12-30
 * Purpose: Add complete traceability for KYC validation (Banking compliance)
 * 
 * Usage: npx tsx src/scripts/add-kyc-audit-trail.ts
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const DATABASE_URL = process.env.DATABASE_URL!;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is not defined in environment variables');
  process.exit(1);
}

async function runMigration() {
  console.log('🚀 Starting KYC Audit Trail Migration...\n');

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL is not defined in environment variables');
    process.exit(1);
  }

  const connection = postgres(DATABASE_URL, { max: 1 });
  const db = drizzle(connection);

  try {
    // Step 1: Add traceability columns
    console.log('📝 Step 1/5: Adding traceability columns...');
    await db.execute(sql`
      ALTER TABLE customers 
        ADD COLUMN IF NOT EXISTS validated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS rejected_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS last_modified_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
        ADD COLUMN IF NOT EXISTS rejection_notes TEXT,
        ADD COLUMN IF NOT EXISTS admin_notes TEXT,
        ADD COLUMN IF NOT EXISTS kyc_audit_trail JSONB DEFAULT '[]'::jsonb;
    `);
    console.log('✅ Columns added successfully\n');

    // Step 2: Create indexes for performance
    console.log('📝 Step 2/5: Creating performance indexes...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_customers_validated_by ON customers(validated_by_user_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_customers_rejected_by ON customers(rejected_by_user_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_customers_last_modified_by ON customers(last_modified_by_user_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_customers_kyc_audit_trail ON customers USING GIN(kyc_audit_trail);`);
    console.log('✅ Indexes created successfully\n');

    // Step 3: Add column comments
    console.log('📝 Step 3/5: Adding documentation comments...');
    await db.execute(sql`COMMENT ON COLUMN customers.validated_by_user_id IS 'ID of admin user who validated the KYC';`);
    await db.execute(sql`COMMENT ON COLUMN customers.rejected_by_user_id IS 'ID of admin user who rejected the KYC';`);
    await db.execute(sql`COMMENT ON COLUMN customers.last_modified_by_user_id IS 'ID of admin user who last modified customer data';`);
    await db.execute(sql`COMMENT ON COLUMN customers.rejection_reason IS 'Reason for KYC rejection (visible to customer)';`);
    await db.execute(sql`COMMENT ON COLUMN customers.rejection_notes IS 'Internal notes for rejection (admin only)';`);
    await db.execute(sql`COMMENT ON COLUMN customers.admin_notes IS 'General admin notes about this customer';`);
    await db.execute(sql`COMMENT ON COLUMN customers.kyc_audit_trail IS 'Complete audit trail: [{action, userId, userName, timestamp, details}]';`);
    console.log('✅ Comments added successfully\n');

    // Step 4: Create audit trigger function
    console.log('📝 Step 4/5: Creating audit trail trigger function...');
    await db.execute(sql`
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
    `);
    console.log('✅ Trigger function created successfully\n');

    // Step 5: Create trigger
    console.log('📝 Step 5/5: Activating automatic audit trail trigger...');
    await db.execute(sql`DROP TRIGGER IF EXISTS customers_kyc_audit_trail_trigger ON customers;`);
    await db.execute(sql`
      CREATE TRIGGER customers_kyc_audit_trail_trigger
        BEFORE UPDATE ON customers
        FOR EACH ROW
        EXECUTE FUNCTION customers_kyc_audit_trigger();
    `);
    console.log('✅ Trigger activated successfully\n');

    console.log('🎉 ✅ KYC Audit Trail Migration completed successfully!\n');
    console.log('📊 Summary:');
    console.log('  - 7 new columns added (validated_by, rejected_by, etc.)');
    console.log('  - 4 performance indexes created');
    console.log('  - Automatic audit trail trigger activated');
    console.log('  - Banking compliance: ENABLED ✅\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration();
