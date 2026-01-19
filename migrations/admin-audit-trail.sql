-- Migration: Add Admin Audit Trail Columns
-- Date: 2025-12-31
-- Purpose: Tracer qui a créé/modifié chaque client (conformité bancaire)

-- Add audit columns
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_admin_role TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_admin_ip TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_by_admin_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_modified_by_admin_id INTEGER;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_modified_by_admin_ip TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_manual_creation BOOLEAN DEFAULT FALSE NOT NULL;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS customers_created_by_admin_id_idx ON customers(created_by_admin_id);
CREATE INDEX IF NOT EXISTS customers_is_manual_creation_idx ON customers(is_manual_creation) WHERE is_manual_creation = TRUE;

-- Add foreign keys
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'customers_created_by_admin_id_fkey'
  ) THEN
    ALTER TABLE customers 
    ADD CONSTRAINT customers_created_by_admin_id_fkey 
    FOREIGN KEY (created_by_admin_id) 
    REFERENCES users(id) 
    ON DELETE SET NULL;
  END IF;
END $$;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'customers_last_modified_by_admin_id_fkey'
  ) THEN
    ALTER TABLE customers 
    ADD CONSTRAINT customers_last_modified_by_admin_id_fkey 
    FOREIGN KEY (last_modified_by_admin_id) 
    REFERENCES users(id) 
    ON DELETE SET NULL;
  END IF;
END $$;
