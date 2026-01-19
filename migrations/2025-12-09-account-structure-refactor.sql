-- Migration: Refonte structure des comptes clients
-- Date: 2025-12-09
-- Description: Ajout table agents, modification account_types pour devises, ajout colonnes CIF/Agent/AccountNumber

-- =====================================================
-- ÉTAPE 1: Créer la table agents
-- =====================================================
CREATE TABLE IF NOT EXISTS agents (
    id SERIAL PRIMARY KEY,
    code VARCHAR(5) UNIQUE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('PHYSICAL', 'VIRTUAL')),
    name TEXT NOT NULL,
    agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL ON UPDATE CASCADE,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Index pour la table agents
CREATE UNIQUE INDEX agents_code_key ON agents(code);
CREATE INDEX agents_agency_id_idx ON agents(agency_id);
CREATE INDEX agents_type_idx ON agents(type);

COMMENT ON TABLE agents IS 'Agents physiques (00001-00199) et virtuels (00200-99999)';
COMMENT ON COLUMN agents.code IS 'Code unique 5 chiffres (00001-99999)';
COMMENT ON COLUMN agents.type IS 'PHYSICAL pour agents réels, VIRTUAL pour auto-assignation';

-- =====================================================
-- ÉTAPE 2: Ajouter colonne code à agencies
-- =====================================================
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS code VARCHAR(2);

-- Mettre à jour les codes existants si nécessaire
UPDATE agencies SET code = LPAD(id::text, 2, '0') WHERE code IS NULL;

-- Rendre la colonne NOT NULL et UNIQUE
ALTER TABLE agencies ALTER COLUMN code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agencies_code_key ON agencies(code);

-- =====================================================
-- ÉTAPE 3: Modifier table account_types pour ajouter currency
-- =====================================================
-- D'abord vérifier si la colonne currency existe
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='account_types' AND column_name='currency') THEN
        ALTER TABLE account_types ADD COLUMN currency TEXT;
        
        -- Contrainte pour currency
        ALTER TABLE account_types ADD CONSTRAINT account_types_currency_check 
            CHECK (currency IN ('USD', 'CDF'));
        
        -- Drop et recréer l'index unique pour inclure currency
        DROP INDEX IF EXISTS account_types_code_key CASCADE;
        CREATE UNIQUE INDEX account_types_code_currency_key ON account_types(code, currency);
    END IF;
END $$;

COMMENT ON COLUMN account_types.currency IS 'Devise du type de compte (USD ou CDF)';

-- =====================================================
-- ÉTAPE 4: Ajouter nouvelles colonnes à customers
-- =====================================================
DO $$ 
BEGIN
    -- Ajouter cif si n'existe pas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='customers' AND column_name='cif') THEN
        ALTER TABLE customers ADD COLUMN cif VARCHAR(8);
        CREATE UNIQUE INDEX customers_cif_key ON customers(cif);
    END IF;
    
    -- Ajouter agent_id si n'existe pas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='customers' AND column_name='agent_id') THEN
        ALTER TABLE customers ADD COLUMN agent_id INTEGER;
        CREATE INDEX customers_agent_id_idx ON customers(agent_id);
    END IF;
    
    -- Ajouter account_number si n'existe pas
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='customers' AND column_name='account_number') THEN
        ALTER TABLE customers ADD COLUMN account_number VARCHAR(8);
    END IF;
END $$;

-- Créer l'index composite unique pour (agency_id, account_number)
CREATE UNIQUE INDEX IF NOT EXISTS customers_agency_account_number_key ON customers(agency_id, account_number);

-- Foreign key pour agent_id (ignorer si existe déjà)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'customers_agent_id_fkey'
    ) THEN
        ALTER TABLE customers ADD CONSTRAINT customers_agent_id_fkey 
            FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

COMMENT ON COLUMN customers.cif IS 'CIF 8 chiffres UNIQUE - Nouveau système';
COMMENT ON COLUMN customers.agent_id IS 'Référence vers l''agent qui a créé/géré le client';
COMMENT ON COLUMN customers.account_number IS 'Numéro de compte 8 chiffres - Unique par agence';

-- =====================================================
-- ÉTAPE 5: Insérer les données initiales
-- =====================================================

-- Insérer les 4 agences si elles n'existent pas déjà
INSERT INTO agencies (code, name, active, address, phone)
VALUES 
    ('01', 'Agence Kinshasa Centre', true, 'Avenue des Aviateurs, Kinshasa', '+243 123 456 789'),
    ('02', 'Agence Gombe', true, 'Boulevard du 30 Juin, Gombe', '+243 123 456 790'),
    ('03', 'Agence Limete', true, 'Avenue Limete, Kinshasa', '+243 123 456 791'),
    ('04', 'Agence Matete', true, 'Avenue Matete, Kinshasa', '+243 123 456 792')
ON CONFLICT (code) DO NOTHING;

-- Insérer les agents initiaux
INSERT INTO agents (code, type, name, is_active)
VALUES 
    ('00001', 'PHYSICAL', 'SerenityBot', true),
    ('00200', 'VIRTUAL', 'Agent Virtuel Auto', true)
ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- ÉTAPE 6: Dupliquer account_types pour USD et CDF
-- =====================================================

-- D'abord, sauvegarder les types existants
CREATE TEMP TABLE temp_account_types AS
SELECT code, label, description, default_status, allowed_currencies
FROM account_types
WHERE currency IS NULL;

-- Supprimer les doublons potentiels
DELETE FROM account_types WHERE currency IS NULL;

-- Insérer les types USD
INSERT INTO account_types (code, label, description, currency, default_status, allowed_currencies)
SELECT 
    code, 
    label || ' USD' as label,
    description,
    'USD' as currency,
    default_status,
    allowed_currencies
FROM temp_account_types
ON CONFLICT (code, currency) DO NOTHING;

-- Insérer les types CDF
INSERT INTO account_types (code, label, description, currency, default_status, allowed_currencies)
SELECT 
    code,
    label || ' CDF' as label,
    description,
    'CDF' as currency,
    default_status,
    allowed_currencies
FROM temp_account_types
ON CONFLICT (code, currency) DO NOTHING;

-- Nettoyer
DROP TABLE temp_account_types;

-- =====================================================
-- ÉTAPE 7: Vérifications finales
-- =====================================================

-- Vérifier que tout est en place
DO $$
DECLARE
    agency_count INTEGER;
    agent_count INTEGER;
    account_type_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO agency_count FROM agencies;
    SELECT COUNT(*) INTO agent_count FROM agents;
    SELECT COUNT(*) INTO account_type_count FROM account_types;
    
    RAISE NOTICE 'Migration terminée avec succès !';
    RAISE NOTICE 'Nombre d''agences: %', agency_count;
    RAISE NOTICE 'Nombre d''agents: %', agent_count;
    RAISE NOTICE 'Nombre de types de compte: %', account_type_count;
END $$;
