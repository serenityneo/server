-- Migration: Add Partner System Tables
-- Description: Add tables for partner points, operations, mobile app installs, and approvals
-- Created: 2025-12-09

-- ===== PARTNER POINTS =====
CREATE TABLE IF NOT EXISTS "partner_points" (
    "id" serial PRIMARY KEY NOT NULL,
    "partner_id" integer NOT NULL,
    "points" integer NOT NULL,
    "operation_type" text NOT NULL,
    "operation_id" integer,
    "description" text NOT NULL,
    "metadata" jsonb,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "partner_points_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "partner_points_partner_id_idx" ON "partner_points" ("partner_id");
CREATE INDEX IF NOT EXISTS "partner_points_operation_type_idx" ON "partner_points" ("operation_type");
CREATE INDEX IF NOT EXISTS "partner_points_created_at_idx" ON "partner_points" ("created_at" DESC);

-- ===== PARTNER OPERATIONS =====
CREATE TABLE IF NOT EXISTS "partner_operations" (
    "id" serial PRIMARY KEY NOT NULL,
    "partner_id" integer NOT NULL,
    "operation_type" text NOT NULL,
    "target_customer_id" integer,
    "amount" numeric(15, 2),
    "currency" "Currency" DEFAULT 'CDF',
    "description" text NOT NULL,
    "status" text DEFAULT 'PENDING' NOT NULL,
    "points_awarded" integer DEFAULT 0 NOT NULL,
    "metadata" jsonb,
    "approved_by" integer,
    "approval_date" timestamp(3),
    "completed_at" timestamp(3),
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "partner_operations_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT "partner_operations_target_customer_id_fkey" FOREIGN KEY ("target_customer_id") REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT "partner_operations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "partner_operations_partner_id_idx" ON "partner_operations" ("partner_id");
CREATE INDEX IF NOT EXISTS "partner_operations_target_customer_id_idx" ON "partner_operations" ("target_customer_id");
CREATE INDEX IF NOT EXISTS "partner_operations_operation_type_idx" ON "partner_operations" ("operation_type");
CREATE INDEX IF NOT EXISTS "partner_operations_status_idx" ON "partner_operations" ("status");
CREATE INDEX IF NOT EXISTS "partner_operations_created_at_idx" ON "partner_operations" ("created_at" DESC);

-- ===== MOBILE APP INSTALLS =====
CREATE TABLE IF NOT EXISTS "mobile_app_installs" (
    "id" serial PRIMARY KEY NOT NULL,
    "partner_id" integer NOT NULL,
    "customer_id" integer NOT NULL,
    "referral_code" text NOT NULL,
    "device_info" jsonb,
    "install_date" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "points_awarded" integer DEFAULT 0 NOT NULL,
    "verified" boolean DEFAULT false NOT NULL,
    "verified_by" integer,
    "verified_at" timestamp(3),
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "mobile_app_installs_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT "mobile_app_installs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT "mobile_app_installs_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "mobile_app_installs_customer_id_key" ON "mobile_app_installs" ("customer_id");
CREATE INDEX IF NOT EXISTS "mobile_app_installs_partner_id_idx" ON "mobile_app_installs" ("partner_id");
CREATE INDEX IF NOT EXISTS "mobile_app_installs_referral_code_idx" ON "mobile_app_installs" ("referral_code");

-- ===== PARTNER APPROVALS =====
CREATE TABLE IF NOT EXISTS "partner_approvals" (
    "id" serial PRIMARY KEY NOT NULL,
    "partner_id" integer NOT NULL,
    "status" text DEFAULT 'PENDING' NOT NULL,
    "agency_id" integer,
    "approved_by" integer,
    "approval_date" timestamp(3),
    "rejection_reason" text,
    "notes" text,
    "created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "partner_approvals_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT "partner_approvals_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "agencies"("id") ON UPDATE CASCADE ON DELETE SET NULL,
    CONSTRAINT "partner_approvals_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "partner_approvals_partner_id_key" ON "partner_approvals" ("partner_id");
CREATE INDEX IF NOT EXISTS "partner_approvals_status_idx" ON "partner_approvals" ("status");

-- Add computed column to customers for total points (view/materialized view approach)
-- This will allow quick access to partner total points
CREATE OR REPLACE VIEW partner_points_summary AS
SELECT 
    partner_id,
    SUM(points) as total_points,
    COUNT(*) as total_operations,
    MAX(created_at) as last_points_date
FROM partner_points
GROUP BY partner_id;

-- Add trigger to auto-create partner_approval record when partner registers
CREATE OR REPLACE FUNCTION create_partner_approval_on_register()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.customer_type = 'PARTNER' THEN
        INSERT INTO partner_approvals (partner_id, status, created_at, updated_at)
        VALUES (NEW.id, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (partner_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_partner_approval
AFTER INSERT ON customers
FOR EACH ROW
EXECUTE FUNCTION create_partner_approval_on_register();

-- Update partner referral code generation function
CREATE OR REPLACE FUNCTION generate_partner_referral_code(partner_id_input integer)
RETURNS text AS $$
DECLARE
    partner_code text;
    referral_code text;
BEGIN
    -- Get partner code from customers table
    SELECT partner_code INTO partner_code FROM customers WHERE id = partner_id_input;
    
    -- Generate referral code: PCODE-YYYYMM-RANDOM
    IF partner_code IS NOT NULL THEN
        referral_code := partner_code || '-' || 
                        TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || 
                        LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
    ELSE
        -- Fallback if partner_code doesn't exist
        referral_code := 'P' || partner_id_input || '-' || 
                        TO_CHAR(CURRENT_DATE, 'YYYYMM') || '-' || 
                        LPAD(FLOOR(RANDOM() * 10000)::text, 4, '0');
    END IF;
    
    RETURN referral_code;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE partner_points IS 'Tracks points earned by partners for various operations';
COMMENT ON TABLE partner_operations IS 'Audit log of all partner operations with approval workflow';
COMMENT ON TABLE mobile_app_installs IS 'Tracks mobile app installations attributed to partners for rewards';
COMMENT ON TABLE partner_approvals IS 'Manages partner approval status and agency assignments';
