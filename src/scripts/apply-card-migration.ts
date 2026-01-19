/**
 * Apply card tables migration directly
 */
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function applyCardMigration() {
  console.log('🔄 Applying card tables migration...\n');

  try {
    // Create enums
    console.log('Creating enums...');
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "CardPaymentMethod" AS ENUM('MOBILE_MONEY', 'S01_ACCOUNT');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "CardRequestStatus" AS ENUM('PENDING', 'PAYMENT_PENDING', 'PAID', 'PROCESSING', 'READY', 'DELIVERED', 'REJECTED', 'CANCELLED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "MobileMoneyProvider" AS ENUM('MPESA', 'AIRTEL_MONEY', 'ORANGE_MONEY', 'AFRIMONEY');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Enums created\n');

    // Create card_types table
    console.log('Creating card_types table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "card_types" (
        "id" serial PRIMARY KEY NOT NULL,
        "code" varchar(20) NOT NULL,
        "name" varchar(100) NOT NULL,
        "description" text,
        "price_usd" numeric(10, 2) NOT NULL,
        "price_cdf" numeric(15, 2) NOT NULL,
        "image_url" text,
        "card_color" varchar(20) DEFAULT '#5C4033',
        "features" text,
        "is_active" boolean DEFAULT true NOT NULL,
        "display_order" integer DEFAULT 0 NOT NULL,
        "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "card_types_code_unique" UNIQUE("code")
      );
    `);
    console.log('✅ card_types table created\n');

    // Create card_requests table
    console.log('Creating card_requests table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "card_requests" (
        "id" serial PRIMARY KEY NOT NULL,
        "customer_id" integer NOT NULL,
        "card_type_id" integer NOT NULL,
        "request_number" varchar(30) NOT NULL,
        "payment_method" "CardPaymentMethod" NOT NULL,
        "mobile_money_provider" "MobileMoneyProvider",
        "mobile_money_number" varchar(20),
        "payment_reference" varchar(100),
        "amount_usd" numeric(10, 2) NOT NULL,
        "amount_cdf" numeric(15, 2) NOT NULL,
        "currency_paid" varchar(3) DEFAULT 'USD',
        "card_number" varchar(20),
        "card_expiry_date" varchar(7),
        "status" "CardRequestStatus" DEFAULT 'PENDING' NOT NULL,
        "reviewed_by_id" integer,
        "review_note" text,
        "rejection_reason" text,
        "requested_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "paid_at" timestamp(3),
        "approved_at" timestamp(3),
        "ready_at" timestamp(3),
        "delivered_at" timestamp(3),
        "rejected_at" timestamp(3),
        "cancelled_at" timestamp(3),
        "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "card_requests_request_number_unique" UNIQUE("request_number")
      );
    `);
    console.log('✅ card_requests table created\n');

    // Create card_payments table
    console.log('Creating card_payments table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "card_payments" (
        "id" serial PRIMARY KEY NOT NULL,
        "card_request_id" integer NOT NULL,
        "customer_id" integer NOT NULL,
        "payment_method" "CardPaymentMethod" NOT NULL,
        "mobile_money_provider" "MobileMoneyProvider",
        "amount_usd" numeric(10, 2) NOT NULL,
        "amount_cdf" numeric(15, 2) NOT NULL,
        "currency" varchar(3) DEFAULT 'USD',
        "transaction_reference" varchar(100),
        "external_reference" varchar(100),
        "status" varchar(20) DEFAULT 'PENDING' NOT NULL,
        "s01_account_id" integer,
        "s01_transaction_id" integer,
        "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "completed_at" timestamp(3),
        "failed_at" timestamp(3),
        "failure_reason" text
      );
    `);
    console.log('✅ card_payments table created\n');

    // Add foreign keys
    console.log('Adding foreign keys...');
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "card_requests" ADD CONSTRAINT "card_requests_customer_id_fkey" 
        FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "card_payments" ADD CONSTRAINT "card_payments_card_request_id_fkey" 
        FOREIGN KEY ("card_request_id") REFERENCES "card_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE "card_payments" ADD CONSTRAINT "card_payments_customer_id_fkey" 
        FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ Foreign keys added\n');

    // Create indexes
    console.log('Creating indexes...');
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "card_requests_customer_id_idx" ON "card_requests" ("customer_id");`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "card_requests_card_type_id_idx" ON "card_requests" ("card_type_id");`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "card_requests_status_idx" ON "card_requests" ("status");`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "card_requests_requested_at_idx" ON "card_requests" ("requested_at");`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "card_payments_card_request_id_idx" ON "card_payments" ("card_request_id");`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "card_payments_customer_id_idx" ON "card_payments" ("customer_id");`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "card_payments_status_idx" ON "card_payments" ("status");`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "card_payments_created_at_idx" ON "card_payments" ("created_at");`);
    console.log('✅ Indexes created\n');

    console.log('🎉 Card tables migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

applyCardMigration();
