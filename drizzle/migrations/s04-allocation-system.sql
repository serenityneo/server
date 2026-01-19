-- ============================================
-- S04 ALLOCATION SYSTEM - DATABASE MIGRATION
-- ============================================
-- Version: 1.0
-- Date: 2024-12-29
-- Description: Crée toutes les tables nécessaires pour le système d'allocation S04
-- 
-- Tables créées:
-- 1. credit_allocations - Compte tampon allocation
-- 2. credit_repayments - Historique remboursements
-- 3. customer_credit_status - Whitelist/Blacklist
-- 4. credit_status_history - Historique changements statut
-- 5. system_credit_config - Configuration système
-- ============================================

-- 1. Table: credit_allocations
CREATE TABLE IF NOT EXISTS credit_allocations (
  id SERIAL PRIMARY KEY,
  credit_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  
  -- Montants demandés
  requested_amount_cdf NUMERIC(15, 2) NOT NULL,
  requested_amount_usd NUMERIC(15, 2),
  
  -- Frais prélevés (allocation)
  fee_amount_cdf NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  fee_amount_usd NUMERIC(15, 2) DEFAULT 0,
  fee_percentage NUMERIC(5, 2) DEFAULT 10 NOT NULL,
  
  -- Montant disponible dans S04 (après déduction frais)
  available_amount_cdf NUMERIC(15, 2) NOT NULL,
  available_amount_usd NUMERIC(15, 2),
  
  -- Dette totale à rembourser
  total_debt_cdf NUMERIC(15, 2) NOT NULL,
  total_debt_usd NUMERIC(15, 2),
  
  -- Dette restante (mise à jour à chaque remboursement)
  remaining_debt_cdf NUMERIC(15, 2) NOT NULL,
  remaining_debt_usd NUMERIC(15, 2),
  
  -- Solde S04 (positif si remboursement > dette)
  s04_balance_cdf NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  s04_balance_usd NUMERIC(15, 2) DEFAULT 0,
  
  -- Montant total récupéré dans allocation
  allocation_balance_cdf NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  allocation_balance_usd NUMERIC(15, 2) DEFAULT 0,
  
  -- Statut
  status TEXT DEFAULT 'ACTIVE' NOT NULL,
  
  -- Compte S04 lié
  s04_account_id INTEGER,
  
  -- Dates
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  fully_repaid_at TIMESTAMP(3),
  
  -- Foreign keys
  CONSTRAINT credit_allocations_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES credits(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT credit_allocations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT credit_allocations_s04_account_id_fkey FOREIGN KEY (s04_account_id) REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE SET NULL
);

-- Index pour credit_allocations
CREATE INDEX IF NOT EXISTS credit_allocations_credit_id_idx ON credit_allocations(credit_id);
CREATE INDEX IF NOT EXISTS credit_allocations_customer_id_idx ON credit_allocations(customer_id);
CREATE INDEX IF NOT EXISTS credit_allocations_status_idx ON credit_allocations(status);

-- 2. Table: credit_repayments
CREATE TABLE IF NOT EXISTS credit_repayments (
  id SERIAL PRIMARY KEY,
  allocation_id INTEGER NOT NULL,
  credit_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  
  -- Montant remboursé
  repayment_amount_cdf NUMERIC(15, 2) NOT NULL,
  repayment_amount_usd NUMERIC(15, 2),
  currency TEXT NOT NULL,
  
  -- Répartition du remboursement
  amount_to_debt_cdf NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  amount_to_debt_usd NUMERIC(15, 2) DEFAULT 0,
  amount_to_allocation_cdf NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  amount_to_allocation_usd NUMERIC(15, 2) DEFAULT 0,
  amount_to_balance_cdf NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  amount_to_balance_usd NUMERIC(15, 2) DEFAULT 0,
  
  -- Solde avant/après
  debt_before_cdf NUMERIC(15, 2) NOT NULL,
  debt_after_cdf NUMERIC(15, 2) NOT NULL,
  balance_before_cdf NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  balance_after_cdf NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  
  -- Métadonnées
  payment_method TEXT,
  reference_number TEXT,
  notes TEXT,
  
  -- Dates
  payment_date TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Foreign keys
  CONSTRAINT credit_repayments_allocation_id_fkey FOREIGN KEY (allocation_id) REFERENCES credit_allocations(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT credit_repayments_credit_id_fkey FOREIGN KEY (credit_id) REFERENCES credits(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT credit_repayments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Index pour credit_repayments
CREATE INDEX IF NOT EXISTS credit_repayments_allocation_id_idx ON credit_repayments(allocation_id);
CREATE INDEX IF NOT EXISTS credit_repayments_credit_id_idx ON credit_repayments(credit_id);
CREATE INDEX IF NOT EXISTS credit_repayments_customer_id_idx ON credit_repayments(customer_id);
CREATE INDEX IF NOT EXISTS credit_repayments_payment_date_idx ON credit_repayments(payment_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS credit_repayments_reference_number_key ON credit_repayments(reference_number);

-- 3. Table: customer_credit_status
CREATE TABLE IF NOT EXISTS customer_credit_status (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  
  -- Statut crédit
  credit_status TEXT DEFAULT 'WHITELISTED' NOT NULL,
  
  -- Scoring
  credit_score NUMERIC(5, 2) DEFAULT 100 NOT NULL,
  
  -- Statistiques
  total_credits_requested INTEGER DEFAULT 0 NOT NULL,
  total_credits_approved INTEGER DEFAULT 0 NOT NULL,
  total_credits_completed INTEGER DEFAULT 0 NOT NULL,
  total_credits_defaulted INTEGER DEFAULT 0 NOT NULL,
  
  -- Montants totaux
  total_amount_borrowed_cdf NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  total_amount_borrowed_usd NUMERIC(15, 2) DEFAULT 0,
  total_amount_repaid_cdf NUMERIC(15, 2) DEFAULT 0 NOT NULL,
  total_amount_repaid_usd NUMERIC(15, 2) DEFAULT 0,
  
  -- Performance
  average_repayment_time_days NUMERIC(10, 2),
  on_time_repayment_percentage NUMERIC(5, 2) DEFAULT 100,
  
  -- Blacklist info
  blacklisted_at TIMESTAMP(3),
  blacklist_reason TEXT,
  blacklist_by INTEGER,
  
  -- Whitelist restoration
  whitelisted_at TIMESTAMP(3),
  whitelist_by INTEGER,
  
  -- Metadata
  notes TEXT,
  last_credit_application_date TIMESTAMP(3),
  last_repayment_date TIMESTAMP(3),
  
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Foreign keys
  CONSTRAINT customer_credit_status_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Index pour customer_credit_status
CREATE UNIQUE INDEX IF NOT EXISTS customer_credit_status_customer_id_key ON customer_credit_status(customer_id);
CREATE INDEX IF NOT EXISTS customer_credit_status_credit_status_idx ON customer_credit_status(credit_status);
CREATE INDEX IF NOT EXISTS customer_credit_status_credit_score_idx ON customer_credit_status(credit_score DESC);

-- 4. Table: credit_status_history
CREATE TABLE IF NOT EXISTS credit_status_history (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  
  previous_status TEXT,
  new_status TEXT NOT NULL,
  
  previous_score NUMERIC(5, 2),
  new_score NUMERIC(5, 2),
  
  reason TEXT NOT NULL,
  changed_by INTEGER,
  changed_by_name TEXT,
  
  metadata JSONB,
  
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  
  -- Foreign keys
  CONSTRAINT credit_status_history_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES customers(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- Index pour credit_status_history
CREATE INDEX IF NOT EXISTS credit_status_history_customer_id_idx ON credit_status_history(customer_id);
CREATE INDEX IF NOT EXISTS credit_status_history_created_at_idx ON credit_status_history(created_at DESC);

-- 5. Table: system_credit_config
CREATE TABLE IF NOT EXISTS system_credit_config (
  id SERIAL PRIMARY KEY,
  
  -- Frais et taux
  default_fee_percentage NUMERIC(5, 2) DEFAULT 10 NOT NULL,
  min_fee_percentage NUMERIC(5, 2) DEFAULT 5 NOT NULL,
  max_fee_percentage NUMERIC(5, 2) DEFAULT 20 NOT NULL,
  
  -- Seuils blacklist
  blacklist_after_defaulted_credits INTEGER DEFAULT 2 NOT NULL,
  blacklist_after_days_overdue INTEGER DEFAULT 30 NOT NULL,
  minimum_credit_score_for_approval NUMERIC(5, 2) DEFAULT 60 NOT NULL,
  
  -- Auto-whitelist conditions
  auto_whitelist_after_days INTEGER DEFAULT 90,
  auto_whitelist_require_full_repayment BOOLEAN DEFAULT TRUE NOT NULL,
  
  -- Toutes opérations S04 gratuites
  s04_fees_enabled BOOLEAN DEFAULT FALSE NOT NULL,
  
  is_active BOOLEAN DEFAULT TRUE NOT NULL,
  updated_by INTEGER,
  
  created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Insérer configuration par défaut
INSERT INTO system_credit_config (
  default_fee_percentage,
  min_fee_percentage,
  max_fee_percentage,
  blacklist_after_defaulted_credits,
  blacklist_after_days_overdue,
  minimum_credit_score_for_approval,
  auto_whitelist_after_days,
  auto_whitelist_require_full_repayment,
  s04_fees_enabled
) VALUES (
  10.00,  -- 10% frais par défaut
  5.00,   -- Min 5%
  20.00,  -- Max 20%
  2,      -- Blacklist après 2 crédits non remboursés
  30,     -- Blacklist après 30 jours de retard
  60.00,  -- Score minimum 60/100
  90,     -- Auto-whitelist après 90 jours
  TRUE,   -- Requiert remboursement complet
  FALSE   -- S04 toujours gratuit
) ON CONFLICT DO NOTHING;

-- ============================================
-- COMMENTAIRES POUR DOCUMENTATION
-- ============================================

COMMENT ON TABLE credit_allocations IS 'Gère le compte tampon allocation pour chaque crédit S04';
COMMENT ON TABLE credit_repayments IS 'Historique détaillé de tous les remboursements';
COMMENT ON TABLE customer_credit_status IS 'Whitelist/Blacklist et scoring crédit des clients';
COMMENT ON TABLE credit_status_history IS 'Historique des changements de statut crédit';
COMMENT ON TABLE system_credit_config IS 'Configuration globale du système de crédit';

-- ============================================
-- FIN DE LA MIGRATION
-- ============================================
