-- Migration: Add Business Profile Fields to Customers
-- Date: 2024-12-29
-- Purpose: Support business/entrepreneur profiles with tax ID and business type

-- Add business profile enum
CREATE TYPE "BusinessType" AS ENUM (
  'INDIVIDUAL',           -- Personne individuelle (par défaut)
  'MICRO_ENTREPRENEUR',   -- Micro-entrepreneur (Marie dans doc)
  'SMALL_BUSINESS',       -- Petite entreprise
  'TRADER',               -- Commerçant
  'FARMER',               -- Agriculteur (VIMBISA)
  'SERVICE_PROVIDER',     -- Prestataire de services
  'ARTISAN',              -- Artisan
  'OTHER'                 -- Autre
);

-- Add columns to customers table
ALTER TABLE customers
ADD COLUMN business_type "BusinessType" DEFAULT 'INDIVIDUAL',
ADD COLUMN business_name TEXT,
ADD COLUMN business_registration_number TEXT,
ADD COLUMN tax_identification_number TEXT,
ADD COLUMN business_start_date DATE,
ADD COLUMN business_sector TEXT,
ADD COLUMN monthly_revenue_estimate NUMERIC(15, 2),
ADD COLUMN business_kyc_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN business_kyc_documents JSONB;

-- Add indexes for business queries
CREATE INDEX idx_customers_business_type ON customers(business_type);
CREATE INDEX idx_customers_tax_id ON customers(tax_identification_number) WHERE tax_identification_number IS NOT NULL;
CREATE INDEX idx_customers_business_kyc ON customers(business_kyc_completed) WHERE business_type != 'INDIVIDUAL';

-- Add comment
COMMENT ON COLUMN customers.business_type IS 'Type d''activité professionnelle du client';
COMMENT ON COLUMN customers.business_kyc_completed IS 'KYC business complété (requis pour entrepreneurs)';
COMMENT ON COLUMN customers.business_kyc_documents IS 'Documents commerciaux: registre commerce, patente, etc.';
