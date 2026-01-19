-- Add missing columns to customers table
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "cif" varchar(8);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "agent_id" integer;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "account_number" varchar(8);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "first_deposit_date" timestamp(3);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "first_deposit_amount" numeric(15, 2);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "first_deposit_commission_awarded" boolean DEFAULT false NOT NULL;

-- Add foreign key if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'customers_agent_id_fkey'
    ) THEN
        ALTER TABLE "customers" ADD CONSTRAINT "customers_agent_id_fkey" 
        FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") 
        ON DELETE set null ON UPDATE cascade;
    END IF;
END $$;

-- Create indexes if not exists
CREATE UNIQUE INDEX IF NOT EXISTS "customers_cif_key" ON "customers" USING btree ("cif" text_ops);
CREATE UNIQUE INDEX IF NOT EXISTS "customers_agency_account_number_key" ON "customers" USING btree ("agency_id" int4_ops,"account_number" text_ops);
CREATE INDEX IF NOT EXISTS "customers_agent_id_idx" ON "customers" USING btree ("agent_id" int4_ops);
