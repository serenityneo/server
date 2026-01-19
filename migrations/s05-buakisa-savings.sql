-- =====================================================
-- S05 BUAKISA CARTE - ÉPARGNE PROGRAMMÉE
-- =====================================================
-- Service d'épargne avec périodicité flexible
-- Premier dépôt → Allocation (système)
-- Dépôts suivants → Solde (client)
-- Sortie anticipée → Pénalité 10% → S06
-- =====================================================

-- Table principale : Comptes d'épargne S05
CREATE TABLE IF NOT EXISTS s05_savings_accounts (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  
  -- Configuration épargne
  periodicity VARCHAR(20) NOT NULL CHECK (periodicity IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')),
  target_amount_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  target_amount_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  number_of_periods INTEGER NOT NULL CHECK (number_of_periods > 0),
  
  -- Calculs automatiques (pourcentage allocation)
  allocation_percentage NUMERIC(5,2) NOT NULL, -- Ex: 20.00 pour 5 périodes
  allocation_amount_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  allocation_amount_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  balance_target_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  balance_target_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_per_period_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_per_period_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Tracking en temps réel
  current_period INTEGER NOT NULL DEFAULT 0,
  total_deposited_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_deposited_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  s05_allocation_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  s05_allocation_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  s05_balance_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  s05_balance_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Dates importantes
  start_date TIMESTAMP NOT NULL,
  maturity_date TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  terminated_at TIMESTAMP,
  
  -- Statut
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'TERMINATED_EARLY')),
  
  -- Pénalité sortie anticipée
  early_termination_penalty_cdf NUMERIC(15,2),
  early_termination_penalty_usd NUMERIC(15,2),
  early_termination_reason TEXT,
  
  -- Métadonnées
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_s05_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_s05_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT
);

-- Index pour performance
CREATE INDEX idx_s05_customer ON s05_savings_accounts(customer_id);
CREATE INDEX idx_s05_account ON s05_savings_accounts(account_id);
CREATE INDEX idx_s05_status ON s05_savings_accounts(status);
CREATE INDEX idx_s05_maturity_date ON s05_savings_accounts(maturity_date);

-- Table : Historique des dépôts S05
CREATE TABLE IF NOT EXISTS s05_deposits (
  id SERIAL PRIMARY KEY,
  savings_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  
  -- Montant déposé
  amount_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL CHECK (currency IN ('CDF', 'USD')),
  
  -- Destination intelligente
  goes_to VARCHAR(20) NOT NULL CHECK (goes_to IN ('ALLOCATION', 'BALANCE')),
  period_number INTEGER, -- Période concernée
  
  -- Validation périodique
  period_completed BOOLEAN NOT NULL DEFAULT FALSE,
  period_target_met BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Métadonnées
  deposit_method VARCHAR(50), -- MOBILE_MONEY, BANK_TRANSFER, CASH
  reference_number VARCHAR(100),
  notes TEXT,
  
  deposit_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_s05_deposit_savings FOREIGN KEY (savings_id) REFERENCES s05_savings_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_s05_deposit_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

-- Index pour performance
CREATE INDEX idx_s05_deposits_savings ON s05_deposits(savings_id);
CREATE INDEX idx_s05_deposits_customer ON s05_deposits(customer_id);
CREATE INDEX idx_s05_deposits_date ON s05_deposits(deposit_date DESC);
CREATE INDEX idx_s05_deposits_period ON s05_deposits(period_number);

-- Table : Tracking des périodes
CREATE TABLE IF NOT EXISTS s05_period_tracking (
  id SERIAL PRIMARY KEY,
  savings_id INTEGER NOT NULL,
  period_number INTEGER NOT NULL CHECK (period_number > 0),
  
  -- Objectif de la période
  target_amount_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  target_amount_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  deposited_amount_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  deposited_amount_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Statut période
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMP,
  
  -- Dates période
  period_start_date TIMESTAMP NOT NULL,
  period_end_date TIMESTAMP NOT NULL,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_s05_period_savings FOREIGN KEY (savings_id) REFERENCES s05_savings_accounts(id) ON DELETE CASCADE,
  CONSTRAINT unique_savings_period UNIQUE(savings_id, period_number)
);

-- Index pour performance
CREATE INDEX idx_s05_period_savings ON s05_period_tracking(savings_id);
CREATE INDEX idx_s05_period_number ON s05_period_tracking(period_number);
CREATE INDEX idx_s05_period_dates ON s05_period_tracking(period_start_date, period_end_date);

-- Table : Historique des retraits/terminaisons S05
CREATE TABLE IF NOT EXISTS s05_withdrawals (
  id SERIAL PRIMARY KEY,
  savings_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  
  -- Type de retrait
  withdrawal_type VARCHAR(20) NOT NULL CHECK (withdrawal_type IN ('MATURITY', 'EARLY_TERMINATION')),
  
  -- Montants
  total_saved_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_saved_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  penalty_amount_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  penalty_amount_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_returned_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_returned_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Métadonnées
  reason TEXT,
  approved_by INTEGER, -- Admin qui a approuvé si besoin
  withdrawal_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_s05_withdrawal_savings FOREIGN KEY (savings_id) REFERENCES s05_savings_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_s05_withdrawal_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

-- Index pour performance
CREATE INDEX idx_s05_withdrawals_savings ON s05_withdrawals(savings_id);
CREATE INDEX idx_s05_withdrawals_customer ON s05_withdrawals(customer_id);
CREATE INDEX idx_s05_withdrawals_date ON s05_withdrawals(withdrawal_date DESC);

-- Fonction : Calculer dates de maturité selon périodicité
CREATE OR REPLACE FUNCTION calculate_s05_maturity_date(
  start_date TIMESTAMP,
  periodicity VARCHAR(20),
  number_of_periods INTEGER
) RETURNS TIMESTAMP AS $$
BEGIN
  RETURN CASE periodicity
    WHEN 'DAILY' THEN start_date + (number_of_periods || ' days')::INTERVAL
    WHEN 'WEEKLY' THEN start_date + (number_of_periods || ' weeks')::INTERVAL
    WHEN 'MONTHLY' THEN start_date + (number_of_periods || ' months')::INTERVAL
    WHEN 'YEARLY' THEN start_date + (number_of_periods || ' years')::INTERVAL
    ELSE start_date
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Fonction : Calculer allocation percentage
CREATE OR REPLACE FUNCTION calculate_s05_allocation_percentage(
  number_of_periods INTEGER
) RETURNS NUMERIC AS $$
BEGIN
  RETURN (100.0 / number_of_periods);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger : Auto-update updated_at
CREATE OR REPLACE FUNCTION update_s05_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_s05_updated_at
  BEFORE UPDATE ON s05_savings_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_s05_updated_at();

-- Commentaires
COMMENT ON TABLE s05_savings_accounts IS 'S05 Buakisa Carte - Comptes épargne programmée avec périodicité flexible';
COMMENT ON TABLE s05_deposits IS 'Historique des dépôts S05 avec routing intelligent (allocation/balance)';
COMMENT ON TABLE s05_period_tracking IS 'Suivi des périodes d''épargne et validation des objectifs';
COMMENT ON TABLE s05_withdrawals IS 'Historique des retraits S05 (maturité ou sortie anticipée)';

COMMENT ON COLUMN s05_savings_accounts.periodicity IS 'DAILY, WEEKLY, MONTHLY, YEARLY';
COMMENT ON COLUMN s05_savings_accounts.allocation_percentage IS 'Pourcentage du premier dépôt (ex: 20% si 5 périodes)';
COMMENT ON COLUMN s05_savings_accounts.s05_allocation_cdf IS 'Montant dans allocation système (premier dépôt)';
COMMENT ON COLUMN s05_savings_accounts.s05_balance_cdf IS 'Montant dans solde client (dépôts suivants)';
COMMENT ON COLUMN s05_deposits.goes_to IS 'ALLOCATION (premier dépôt) ou BALANCE (suivants)';
