-- Migration: Approval and Migration System
-- Created: 2026-01-06

-- Create enums
DO $$ BEGIN
  CREATE TYPE "ApprovalStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ApprovalRequestType" AS ENUM('MIGRATION', 'SERVICE_ACTIVATION', 'BALANCE_UPDATE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create approval_requests table (unified)
CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "request_type" "ApprovalRequestType" NOT NULL,
  "reference_id" integer,
  "customer_id" integer NOT NULL,
  "created_by_user_id" integer NOT NULL,
  "created_by_role" text NOT NULL,
  "created_by_name" text NOT NULL,
  "requires_validation_by_role" text NOT NULL,
  "validated_by_user_id" integer,
  "validated_by_role" text,
  "validated_by_name" text,
  "validated_at" timestamp(3),
  "status" "ApprovalStatus" DEFAULT 'PENDING' NOT NULL,
  "rejection_reason" text,
  "request_data" jsonb NOT NULL,
  "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create migration_requests table
CREATE TABLE IF NOT EXISTS "migration_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "customer_id" integer NOT NULL,
  "created_by_user_id" integer NOT NULL,
  "deposit_s01_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
  "deposit_s01_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
  "deposit_s02_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
  "deposit_s02_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
  "deposit_s03_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
  "deposit_s03_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
  "deposit_s04_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
  "deposit_s04_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
  "deposit_s05_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
  "deposit_s05_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
  "deposit_s06_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
  "deposit_s06_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
  "kyc_data" jsonb,
  "missing_kyc_fields" jsonb,
  "requested_services" jsonb,
  "approval_request_id" integer,
  "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create service_activation_requests table
CREATE TABLE IF NOT EXISTS "service_activation_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "customer_id" integer NOT NULL,
  "created_by_user_id" integer NOT NULL,
  "services" jsonb NOT NULL,
  "migration_request_id" integer,
  "approval_request_id" integer,
  "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create customer_services table
CREATE TABLE IF NOT EXISTS "customer_services" (
  "id" serial PRIMARY KEY NOT NULL,
  "customer_id" integer NOT NULL,
  "service_code" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "activated_by_user_id" integer NOT NULL,
  "activated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "deactivated_by_user_id" integer,
  "deactivated_at" timestamp(3),
  "deactivation_reason" text,
  "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Add indexes
CREATE INDEX IF NOT EXISTS "approval_requests_status_idx" ON "approval_requests" USING btree ("status");
CREATE INDEX IF NOT EXISTS "approval_requests_creator_idx" ON "approval_requests" USING btree ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "approval_requests_customer_idx" ON "approval_requests" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "approval_requests_requires_role_idx" ON "approval_requests" USING btree ("requires_validation_by_role");

CREATE INDEX IF NOT EXISTS "migration_requests_customer_id_idx" ON "migration_requests" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "migration_requests_approval_idx" ON "migration_requests" USING btree ("approval_request_id");

CREATE INDEX IF NOT EXISTS "service_activation_requests_customer_id_idx" ON "service_activation_requests" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "service_activation_requests_approval_idx" ON "service_activation_requests" USING btree ("approval_request_id");

CREATE INDEX IF NOT EXISTS "customer_services_customer_id_idx" ON "customer_services" USING btree ("customer_id");
CREATE INDEX IF NOT EXISTS "customer_services_service_code_idx" ON "customer_services" USING btree ("service_code");
CREATE INDEX IF NOT EXISTS "customer_services_is_active_idx" ON "customer_services" USING btree ("is_active");

-- Add foreign keys
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE cascade;

ALTER TABLE "migration_requests" ADD CONSTRAINT "migration_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "migration_requests" ADD CONSTRAINT "migration_requests_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "migration_requests" ADD CONSTRAINT "migration_requests_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE set null ON UPDATE cascade;

ALTER TABLE "service_activation_requests" ADD CONSTRAINT "service_activation_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "service_activation_requests" ADD CONSTRAINT "service_activation_requests_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "service_activation_requests" ADD CONSTRAINT "service_activation_requests_migration_request_id_fkey" FOREIGN KEY ("migration_request_id") REFERENCES "migration_requests"("id") ON DELETE set null ON UPDATE cascade;
ALTER TABLE "service_activation_requests" ADD CONSTRAINT "service_activation_requests_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE set null ON UPDATE cascade;

ALTER TABLE "customer_services" ADD CONSTRAINT "customer_services_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE cascade ON UPDATE cascade;
ALTER TABLE "customer_services" ADD CONSTRAINT "customer_services_activated_by_user_id_fkey" FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE cascade;
ALTER TABLE "customer_services" ADD CONSTRAINT "customer_services_deactivated_by_user_id_fkey" FOREIGN KEY ("deactivated_by_user_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE cascade;
