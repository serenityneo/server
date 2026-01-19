-- Add new roles: Caissier and KYC Validator
-- Add agency_id to users table

-- Insert new roles
INSERT INTO roles (name, description) 
VALUES 
  ('Caissier', 'Agent de caisse - opérations dépôts/retraits'),
  ('KYC Validator', 'Validateur KYC - validation documents clients')
ON CONFLICT (name) DO NOTHING;

-- Add agency_id to users table (for Caissiers - multiple per agency)
ALTER TABLE users ADD COLUMN IF NOT EXISTS agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL;

-- Create index for agency_id
CREATE INDEX IF NOT EXISTS users_agency_id_idx ON users(agency_id);

-- Add manager_id to agencies table (one manager per agency)
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Create index for manager_id
CREATE INDEX IF NOT EXISTS agencies_manager_id_idx ON agencies(manager_id);
