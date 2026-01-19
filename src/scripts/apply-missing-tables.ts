/**
 * Apply missing core tables migration
 */
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function applyMissingTablesMigration() {
  console.log('🔄 Checking and creating missing tables...\n');

  try {
    // Check which tables exist
    const existingTables = await db.execute(sql`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tableNames = (existingTables as any[]).map((r: any) => r.table_name);
    console.log('Existing tables count:', tableNames.length);

    // Create account_types if not exists
    if (!tableNames.includes('account_types')) {
      console.log('Creating account_types table...');
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "account_types" (
          "id" serial PRIMARY KEY,
          "code" varchar(50) NOT NULL UNIQUE,
          "name" varchar(100) NOT NULL,
          "description" text,
          "is_system" boolean DEFAULT false,
          "is_active" boolean DEFAULT true,
          "min_balance_cdf" numeric(15, 2) DEFAULT '0',
          "min_balance_usd" numeric(15, 2) DEFAULT '0',
          "created_at" timestamp DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ account_types created');
      
      // Seed account types
      await db.execute(sql`
        INSERT INTO account_types (code, name, description, is_system, is_active) VALUES
        ('S01_STANDARD', 'Compte Standard', 'Compte courant principal', true, true),
        ('S02_MANDATORY_SAVINGS', 'Épargne Obligatoire', 'Compte d''épargne obligatoire', true, true),
        ('S03_CAUTION', 'Compte Caution', 'Compte de garantie pour crédits', true, true),
        ('S04_CREDIT', 'Compte Crédit', 'Compte de gestion des crédits', true, true),
        ('S05_BWAKISA_CARTE', 'Épargne Bwakisa Carte', 'Épargne programmée pour carte', true, true),
        ('S06_FINES', 'Compte Amendes', 'Compte pour pénalités et amendes', true, true)
        ON CONFLICT (code) DO NOTHING
      `);
      console.log('✅ account_types seeded');
    } else {
      console.log('✓ account_types already exists');
    }

    // Create account_type_conditions if not exists
    if (!tableNames.includes('account_type_conditions')) {
      console.log('Creating account_type_conditions table...');
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "account_type_conditions" (
          "id" serial PRIMARY KEY,
          "account_type_code" varchar(50) NOT NULL,
          "condition_type" varchar(50) NOT NULL,
          "condition_label" varchar(200) NOT NULL,
          "condition_description" text,
          "condition_operator" varchar(20) DEFAULT 'AND',
          "condition_value" text,
          "min_value" numeric(15, 2),
          "max_value" numeric(15, 2),
          "display_order" integer DEFAULT 0,
          "is_active" boolean DEFAULT true,
          "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
          "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ account_type_conditions created');
    } else {
      console.log('✓ account_type_conditions already exists');
    }

    // Create credit_lifecycle_status enum if not exists
    console.log('Creating credit enums...');
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "credit_lifecycle_status" AS ENUM(
          'ELIGIBILITY_CHECK', 'DOCUMENTS_PENDING', 'DOCUMENTS_SUBMITTED', 
          'ADMIN_REVIEW', 'CAUTION_PENDING', 'APPROVED', 'DISBURSED', 
          'ACTIVE', 'COMPLETED', 'DEFAULTED', 'VIRTUAL_PRISON', 
          'LEGAL_PURSUIT', 'CANCELLED'
        );
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "credit_product_type" AS ENUM('BOMBE', 'TELEMA', 'MOPAO', 'VIMBISA', 'LIKELEMBA');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "repayment_status" AS ENUM('ON_TIME', 'LATE', 'PARTIALLY_PAID', 'MISSED', 'RECOVERED');
      EXCEPTION WHEN duplicate_object THEN null;
      END $$
    `);
    console.log('✅ Credit enums created');

    // Create credit_applications if not exists
    if (!tableNames.includes('credit_applications')) {
      console.log('Creating credit_applications table...');
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "credit_applications" (
          "id" serial PRIMARY KEY,
          "customer_id" integer NOT NULL,
          "product_type" "credit_product_type" NOT NULL,
          "requested_amount_cdf" numeric(15, 2) DEFAULT '0',
          "requested_amount_usd" numeric(15, 2) DEFAULT '0',
          "approved_amount_cdf" numeric(15, 2),
          "approved_amount_usd" numeric(15, 2),
          "disbursed_amount_cdf" numeric(15, 2),
          "disbursed_amount_usd" numeric(15, 2),
          "processing_fee_cdf" numeric(15, 2) DEFAULT '0',
          "processing_fee_usd" numeric(15, 2) DEFAULT '0',
          "interest_rate" numeric(5, 2) DEFAULT '0',
          "total_interest_cdf" numeric(15, 2) DEFAULT '0',
          "total_interest_usd" numeric(15, 2) DEFAULT '0',
          "duration_months" integer,
          "duration_days" integer,
          "s02_account_id" integer,
          "s03_caution_account_id" integer,
          "s04_credit_account_id" integer,
          "caution_percentage" numeric(5, 2) DEFAULT '30.00',
          "caution_amount_cdf" numeric(15, 2),
          "caution_amount_usd" numeric(15, 2),
          "caution_deposited" boolean DEFAULT false,
          "business_documents" jsonb,
          "documents_validated" boolean DEFAULT false,
          "documents_validator_id" integer,
          "documents_validation_date" timestamp,
          "status" "credit_lifecycle_status" DEFAULT 'ELIGIBILITY_CHECK',
          "eligibility_check_passed" boolean DEFAULT false,
          "eligibility_reasons" text[],
          "monthly_payment_cdf" numeric(15, 2),
          "monthly_payment_usd" numeric(15, 2),
          "daily_payment_cdf" numeric(15, 2),
          "daily_payment_usd" numeric(15, 2),
          "total_paid_cdf" numeric(15, 2) DEFAULT '0',
          "total_paid_usd" numeric(15, 2) DEFAULT '0',
          "remaining_balance_cdf" numeric(15, 2),
          "remaining_balance_usd" numeric(15, 2),
          "late_interest_rate" numeric(5, 2) DEFAULT '5.00',
          "total_late_interest_cdf" numeric(15, 2) DEFAULT '0',
          "total_late_interest_usd" numeric(15, 2) DEFAULT '0',
          "penalty_amount_cdf" numeric(15, 2) DEFAULT '0',
          "penalty_amount_usd" numeric(15, 2) DEFAULT '0',
          "application_date" timestamp DEFAULT CURRENT_TIMESTAMP,
          "approval_date" timestamp,
          "disbursement_date" timestamp,
          "maturity_date" timestamp,
          "completion_date" timestamp,
          "default_date" timestamp,
          "is_auto_renewable" boolean DEFAULT false,
          "renewal_count" integer DEFAULT 0,
          "last_renewal_date" timestamp,
          "next_renewal_date" timestamp,
          "sponsor_customer_id" integer,
          "sponsored_customers" integer[],
          "sponsor_guarantee_percentage" numeric(5, 2) DEFAULT '40.00',
          "approved_by" integer,
          "notes" text,
          "created_at" timestamp DEFAULT CURRENT_TIMESTAMP,
          "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ credit_applications created');
      
      // Add foreign key
      await db.execute(sql`
        ALTER TABLE "credit_applications" 
        ADD CONSTRAINT "fk_credit_customer" 
        FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT
      `).catch(() => console.log('FK already exists or customers table missing'));
      
      // Create indexes
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_credit_applications_customer" ON "credit_applications" ("customer_id")`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_credit_applications_status" ON "credit_applications" ("status")`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_credit_applications_product" ON "credit_applications" ("product_type")`);
      console.log('✅ credit_applications indexes created');
    } else {
      console.log('✓ credit_applications already exists');
    }

    console.log('\n🎉 Missing tables migration completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyMissingTablesMigration();
