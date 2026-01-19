-- Migration: Add Partner Commission System
-- Created: 2025-12-09
-- Description: Add tables for managing partner commissions with multi-currency support,
--              validity periods, and notification system

-- Commission configurations table
CREATE TABLE IF NOT EXISTS "commission_configurations" (
    "id" SERIAL PRIMARY KEY,
    "operation_type" TEXT NOT NULL,
    "commission_amount_usd" NUMERIC(15, 2) NOT NULL DEFAULT 0,
    "commission_amount_cdf" NUMERIC(15, 2) NOT NULL DEFAULT 0,
    "commission_percentage" NUMERIC(5, 2),
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "conditions" JSONB,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commission_configurations_created_by_fkey" 
        FOREIGN KEY ("created_by") REFERENCES "users"("id") 
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Partner commissions table
CREATE TABLE IF NOT EXISTS "partner_commissions" (
    "id" SERIAL PRIMARY KEY,
    "partner_id" INTEGER NOT NULL,
    "operation_id" INTEGER NOT NULL,
    "configuration_id" INTEGER NOT NULL,
    "amount_usd" NUMERIC(15, 2) NOT NULL DEFAULT 0,
    "amount_cdf" NUMERIC(15, 2) NOT NULL DEFAULT 0,
    "calculation_basis" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMP(3),
    "payment_reference" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "partner_commissions_partner_id_fkey" 
        FOREIGN KEY ("partner_id") REFERENCES "customers"("id") 
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT "partner_commissions_operation_id_fkey" 
        FOREIGN KEY ("operation_id") REFERENCES "partner_operations"("id") 
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT "partner_commissions_configuration_id_fkey" 
        FOREIGN KEY ("configuration_id") REFERENCES "commission_configurations"("id") 
        ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Commission notifications table
CREATE TABLE IF NOT EXISTS "commission_notifications" (
    "id" SERIAL PRIMARY KEY,
    "partner_id" INTEGER NOT NULL,
    "configuration_id" INTEGER,
    "notification_type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "commission_notifications_partner_id_fkey" 
        FOREIGN KEY ("partner_id") REFERENCES "customers"("id") 
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "commission_notifications_configuration_id_fkey" 
        FOREIGN KEY ("configuration_id") REFERENCES "commission_configurations"("id") 
        ON UPDATE CASCADE ON DELETE SET NULL
);

-- Create indexes for commission_configurations
CREATE INDEX IF NOT EXISTS "commission_configurations_operation_type_idx" 
    ON "commission_configurations" ("operation_type");
CREATE INDEX IF NOT EXISTS "commission_configurations_valid_from_idx" 
    ON "commission_configurations" ("valid_from");
CREATE INDEX IF NOT EXISTS "commission_configurations_is_active_idx" 
    ON "commission_configurations" ("is_active");

-- Create indexes for partner_commissions
CREATE INDEX IF NOT EXISTS "partner_commissions_partner_id_idx" 
    ON "partner_commissions" ("partner_id");
CREATE INDEX IF NOT EXISTS "partner_commissions_operation_id_idx" 
    ON "partner_commissions" ("operation_id");
CREATE INDEX IF NOT EXISTS "partner_commissions_status_idx" 
    ON "partner_commissions" ("status");
CREATE INDEX IF NOT EXISTS "partner_commissions_created_at_idx" 
    ON "partner_commissions" ("created_at" DESC);

-- Create indexes for commission_notifications
CREATE INDEX IF NOT EXISTS "commission_notifications_partner_id_idx" 
    ON "commission_notifications" ("partner_id");
CREATE INDEX IF NOT EXISTS "commission_notifications_is_read_idx" 
    ON "commission_notifications" ("is_read");
CREATE INDEX IF NOT EXISTS "commission_notifications_created_at_idx" 
    ON "commission_notifications" ("created_at" DESC);

-- Add commission tracking fields to partner_operations table (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='partner_operations' AND column_name='commission_awarded_usd') THEN
        ALTER TABLE "partner_operations" 
        ADD COLUMN "commission_awarded_usd" NUMERIC(15, 2) DEFAULT 0 NOT NULL,
        ADD COLUMN "commission_awarded_cdf" NUMERIC(15, 2) DEFAULT 0 NOT NULL;
    END IF;
END $$;

-- Create function to automatically expire commission configurations
CREATE OR REPLACE FUNCTION expire_commission_configurations()
RETURNS void AS $$
BEGIN
    UPDATE commission_configurations
    SET is_active = false
    WHERE valid_until IS NOT NULL 
      AND valid_until < CURRENT_TIMESTAMP 
      AND is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Create function to notify partners about commission changes
CREATE OR REPLACE FUNCTION notify_commission_change()
RETURNS TRIGGER AS $$
DECLARE
    affected_partners INTEGER[];
    partner_id INTEGER;
BEGIN
    -- Get all active partners
    SELECT ARRAY_AGG(DISTINCT id) INTO affected_partners
    FROM customers
    WHERE customer_type = 'PARTNER' AND is_active = true;

    -- Send notification to each partner
    IF affected_partners IS NOT NULL THEN
        FOREACH partner_id IN ARRAY affected_partners
        LOOP
            INSERT INTO commission_notifications (
                partner_id,
                configuration_id,
                notification_type,
                title,
                message,
                data
            ) VALUES (
                partner_id,
                NEW.id,
                CASE 
                    WHEN TG_OP = 'INSERT' THEN 'CONFIG_CREATED'
                    WHEN TG_OP = 'UPDATE' THEN 'CONFIG_UPDATED'
                END,
                CASE 
                    WHEN TG_OP = 'INSERT' THEN 'New Commission Structure Available'
                    WHEN TG_OP = 'UPDATE' THEN 'Commission Structure Updated'
                END,
                CASE 
                    WHEN TG_OP = 'INSERT' THEN 'A new commission structure has been created for ' || NEW.operation_type
                    WHEN TG_OP = 'UPDATE' THEN 'The commission structure for ' || NEW.operation_type || ' has been updated'
                END,
                jsonb_build_object(
                    'operation_type', NEW.operation_type,
                    'amount_usd', NEW.commission_amount_usd,
                    'amount_cdf', NEW.commission_amount_cdf,
                    'valid_from', NEW.valid_from,
                    'valid_until', NEW.valid_until
                )
            );
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for commission configuration changes
DROP TRIGGER IF EXISTS commission_config_change_trigger ON commission_configurations;
CREATE TRIGGER commission_config_change_trigger
    AFTER INSERT OR UPDATE ON commission_configurations
    FOR EACH ROW
    WHEN (NEW.is_active = true)
    EXECUTE FUNCTION notify_commission_change();

-- Insert default commission configurations
INSERT INTO commission_configurations (
    operation_type, 
    commission_amount_usd, 
    commission_amount_cdf,
    description,
    created_by
) VALUES 
    ('CLIENT_CREATION', 2.00, 4000.00, 'Commission for creating new client accounts', 1),
    ('DEPOSIT', 0.50, 1000.00, 'Commission for deposit transactions', 1),
    ('WITHDRAWAL', 0.50, 1000.00, 'Commission for withdrawal transactions', 1),
    ('PAYMENT', 0.75, 1500.00, 'Commission for payment processing', 1),
    ('CREDIT_APPLICATION', 5.00, 10000.00, 'Commission for credit applications', 1),
    ('APP_INSTALL', 3.00, 6000.00, 'Commission for mobile app installations', 1)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE commission_configurations IS 'Stores commission configurations for partner operations with validity periods';
COMMENT ON TABLE partner_commissions IS 'Tracks commissions earned by partners for completed operations';
COMMENT ON TABLE commission_notifications IS 'Notifications sent to partners about commission structure changes';
