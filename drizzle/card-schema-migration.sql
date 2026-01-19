-- Card Schema Migration
-- Creates the card_types, card_requests, and card_payments tables

-- Create enums if they don't exist
DO $$ BEGIN
  CREATE TYPE "CardRequestStatus" AS ENUM (
    'PENDING',
    'PAYMENT_PENDING', 
    'PAID',
    'PROCESSING',
    'READY',
    'DELIVERED',
    'REJECTED',
    'CANCELLED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "CardPaymentMethod" AS ENUM (
    'MOBILE_MONEY',
    'S01_ACCOUNT'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "MobileMoneyProvider" AS ENUM (
    'MPESA',
    'AIRTEL_MONEY',
    'ORANGE_MONEY',
    'VODACOM'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create card_types table
CREATE TABLE IF NOT EXISTS "card_types" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" varchar(20) NOT NULL UNIQUE,
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
  "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create card_requests table
CREATE TABLE IF NOT EXISTS "card_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "customer_id" integer NOT NULL,
  "card_type_id" integer NOT NULL,
  "request_number" varchar(30) NOT NULL UNIQUE,
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
  CONSTRAINT "card_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create card_payments table
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
  "failure_reason" text,
  CONSTRAINT "card_payments_card_request_id_fkey" FOREIGN KEY ("card_request_id") REFERENCES "card_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "card_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS "card_requests_customer_id_idx" ON "card_requests" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "card_requests_card_type_id_idx" ON "card_requests" USING btree ("card_type_id");
CREATE INDEX IF NOT EXISTS "card_requests_status_idx" ON "card_requests" USING btree ("status");
CREATE INDEX IF NOT EXISTS "card_requests_requested_at_idx" ON "card_requests" USING btree ("requested_at" DESC);
CREATE INDEX IF NOT EXISTS "card_payments_card_request_id_idx" ON "card_payments" USING btree ("card_request_id");
CREATE INDEX IF NOT EXISTS "card_payments_customer_id_idx" ON "card_payments" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "card_payments_status_idx" ON "card_payments" USING btree ("status");
CREATE INDEX IF NOT EXISTS "card_payments_created_at_idx" ON "card_payments" USING btree ("created_at" DESC);

SELECT 'Card schema created successfully!' as result;
