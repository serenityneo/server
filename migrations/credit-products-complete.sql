-- =====================================================
-- SYSTÈME CRÉDIT COMPLET - 5 PRODUITS
-- =====================================================
-- 1. BOMBÉ - Crédit renouvelable quotidien (0% intérêt)
-- 2. TELEMA - Crédit individuel 6/9/12 mois
-- 3. MOPAO - Crédit parrainage GOLD (1-1.5% intérêt)
-- 4. VIMBISA - Crédit saisonnier CDF (5 cycles Bwakisa)
-- 5. LIKELEMBA - Crédit épargne de groupe
-- =====================================================

-- ===== ENUMS =====
CREATE TYPE credit_product_type AS ENUM (
  'BOMBE',
  'TELEMA',
  'MOPAO',
  'VIMBISA',
  'LIKELEMBA'
);

CREATE TYPE credit_lifecycle_status AS ENUM (
  'ELIGIBILITY_CHECK',      -- Vérification éligibilité
  'DOCUMENTS_PENDING',       -- En attente documents
  'DOCUMENTS_SUBMITTED',     -- Documents soumis
  'ADMIN_REVIEW',            -- Révision admin
  'CAUTION_PENDING',         -- En attente dépôt caution
  'APPROVED',                -- Approuvé
  'DISBURSED',               -- Décaissé (actif)
  'ACTIVE',                  -- En cours de remboursement
  'COMPLETED',               -- Complété
  'DEFAULTED',               -- Défaut de paiement
  'VIRTUAL_PRISON',          -- Prison virtuelle (blocage)
  'LEGAL_PURSUIT',           -- Poursuites légales
  'CANCELLED'                -- Annulé
);

CREATE TYPE repayment_status AS ENUM (
  'ON_TIME',
  'LATE',
  'PARTIALLY_PAID',
  'MISSED',
  'RECOVERED'
);

-- ===== TABLE PRINCIPALE: CRÉDITS =====
CREATE TABLE IF NOT EXISTS credit_applications (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  product_type credit_product_type NOT NULL,
  
  -- Montants
  requested_amount_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  requested_amount_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  approved_amount_cdf NUMERIC(15,2),
  approved_amount_usd NUMERIC(15,2),
  disbursed_amount_cdf NUMERIC(15,2),
  disbursed_amount_usd NUMERIC(15,2),
  
  -- Frais et intérêts
  processing_fee_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  processing_fee_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  interest_rate NUMERIC(5,2) NOT NULL DEFAULT 0, -- Ex: 5.50 pour 5.5%
  total_interest_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_interest_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Durée (TELEMA/MOPAO: 6,9,12 mois)
  duration_months INTEGER,
  duration_days INTEGER,
  
  -- Comptes liés
  s02_account_id INTEGER,
  s03_caution_account_id INTEGER,
  s04_credit_account_id INTEGER,
  
  -- Caution
  caution_percentage NUMERIC(5,2) NOT NULL DEFAULT 30.00,
  caution_amount_cdf NUMERIC(15,2),
  caution_amount_usd NUMERIC(15,2),
  caution_deposited BOOLEAN DEFAULT FALSE,
  
  -- Documents
  business_documents JSONB, -- URLs documents commerciaux
  documents_validated BOOLEAN DEFAULT FALSE,
  documents_validator_id INTEGER,
  documents_validation_date TIMESTAMP,
  
  -- Lifecycle
  status credit_lifecycle_status NOT NULL DEFAULT 'ELIGIBILITY_CHECK',
  eligibility_check_passed BOOLEAN DEFAULT FALSE,
  eligibility_reasons TEXT[],
  
  -- Remboursement
  monthly_payment_cdf NUMERIC(15,2),
  monthly_payment_usd NUMERIC(15,2),
  daily_payment_cdf NUMERIC(15,2),
  daily_payment_usd NUMERIC(15,2),
  total_paid_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_paid_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  remaining_balance_cdf NUMERIC(15,2),
  remaining_balance_usd NUMERIC(15,2),
  
  -- Pénalités
  late_interest_rate NUMERIC(5,2) DEFAULT 5.00, -- 5% journalier (BOMBÉ) ou 2% mensuel (TELEMA)
  total_late_interest_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_late_interest_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  penalty_amount_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  penalty_amount_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Dates importantes
  application_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approval_date TIMESTAMP,
  disbursement_date TIMESTAMP,
  maturity_date TIMESTAMP,
  completion_date TIMESTAMP,
  default_date TIMESTAMP,
  
  -- BOMBÉ spécifique
  is_auto_renewable BOOLEAN DEFAULT FALSE,
  renewal_count INTEGER DEFAULT 0,
  last_renewal_date TIMESTAMP,
  next_renewal_date TIMESTAMP,
  
  -- MOPAO spécifique (parrainage)
  sponsor_customer_id INTEGER, -- Client GOLD parrain
  sponsored_customers INTEGER[], -- IDs des parrainés
  sponsor_guarantee_percentage NUMERIC(5,2) DEFAULT 40.00,
  
  -- Admin
  approved_by INTEGER,
  notes TEXT,
  
  -- Métadonnées
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_credit_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_credit_s02 FOREIGN KEY (s02_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_credit_s03 FOREIGN KEY (s03_caution_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
  CONSTRAINT fk_credit_s04 FOREIGN KEY (s04_credit_account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE INDEX idx_credit_applications_customer ON credit_applications(customer_id);
CREATE INDEX idx_credit_applications_product ON credit_applications(product_type);
CREATE INDEX idx_credit_applications_status ON credit_applications(status);
CREATE INDEX idx_credit_applications_disbursement_date ON credit_applications(disbursement_date);

-- ===== REMBOURSEMENTS =====
CREATE TABLE IF NOT EXISTS credit_repayments (
  id SERIAL PRIMARY KEY,
  credit_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  
  -- Montant
  amount_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL,
  
  -- Type
  payment_type VARCHAR(20) NOT NULL, -- 'DAILY', 'WEEKLY', 'MONTHLY', 'PARTIAL'
  is_on_time BOOLEAN DEFAULT TRUE,
  
  -- Échéance
  due_date DATE,
  payment_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  days_late INTEGER DEFAULT 0,
  
  -- Statut
  status repayment_status NOT NULL DEFAULT 'ON_TIME',
  
  -- Source paiement
  paid_from_account_id INTEGER, -- S01 standard
  auto_debited_from_s02 BOOLEAN DEFAULT FALSE,
  auto_debited_from_s03 BOOLEAN DEFAULT FALSE,
  
  -- Métadonnées
  reference_number VARCHAR(100),
  notes TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_repayment_credit FOREIGN KEY (credit_id) REFERENCES credit_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_repayment_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT
);

CREATE INDEX idx_repayments_credit ON credit_repayments(credit_id);
CREATE INDEX idx_repayments_customer ON credit_repayments(customer_id);
CREATE INDEX idx_repayments_due_date ON credit_repayments(due_date);
CREATE INDEX idx_repayments_status ON credit_repayments(status);

-- ===== NOTIFICATIONS CRÉDIT =====
CREATE TABLE IF NOT EXISTS credit_notifications (
  id SERIAL PRIMARY KEY,
  credit_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  
  -- Type notification
  notification_type VARCHAR(50) NOT NULL, -- 'REMINDER_1PM', 'REMINDER_5PM', 'LATE_PAYMENT', 'APPROVED', 'DISBURSED', etc.
  
  -- Contenu
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  
  -- Canaux
  sent_via_sms BOOLEAN DEFAULT FALSE,
  sent_via_email BOOLEAN DEFAULT FALSE,
  sent_via_push BOOLEAN DEFAULT FALSE,
  
  -- Statut
  is_sent BOOLEAN DEFAULT FALSE,
  is_read BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP,
  read_at TIMESTAMP,
  
  -- Métadonnées
  scheduled_for TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_notification_credit FOREIGN KEY (credit_id) REFERENCES credit_applications(id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX idx_notifications_credit ON credit_notifications(credit_id);
CREATE INDEX idx_notifications_customer ON credit_notifications(customer_id);
CREATE INDEX idx_notifications_scheduled ON credit_notifications(scheduled_for);
CREATE INDEX idx_notifications_type ON credit_notifications(notification_type);

-- ===== HISTORIQUE AUTO-RENOUVELLEMENT BOMBÉ =====
CREATE TABLE IF NOT EXISTS bombe_renewal_history (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  previous_credit_id INTEGER,
  new_credit_id INTEGER NOT NULL,
  
  amount_usd NUMERIC(10,2) NOT NULL,
  renewal_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  auto_renewed BOOLEAN DEFAULT TRUE,
  
  -- Raisons si pas renouvelé
  renewal_blocked BOOLEAN DEFAULT FALSE,
  blocked_reason TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_renewal_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_renewal_previous FOREIGN KEY (previous_credit_id) REFERENCES credit_applications(id) ON DELETE SET NULL,
  CONSTRAINT fk_renewal_new FOREIGN KEY (new_credit_id) REFERENCES credit_applications(id) ON DELETE CASCADE
);

CREATE INDEX idx_renewal_customer ON bombe_renewal_history(customer_id);
CREATE INDEX idx_renewal_date ON bombe_renewal_history(renewal_date DESC);

-- ===== TRACKING DÉPÔTS S02 POUR ÉLIGIBILITÉ =====
CREATE TABLE IF NOT EXISTS s02_deposit_tracking (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  s02_account_id INTEGER NOT NULL,
  
  deposit_date DATE NOT NULL,
  amount_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  amount_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Consécutivité
  is_consecutive BOOLEAN DEFAULT TRUE,
  consecutive_days_count INTEGER DEFAULT 1,
  consecutive_weeks_count INTEGER DEFAULT 1,
  
  -- Métadonnées
  transaction_id INTEGER,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_s02_tracking_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_s02_tracking_account FOREIGN KEY (s02_account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT unique_customer_deposit_date UNIQUE(customer_id, deposit_date)
);

CREATE INDEX idx_s02_tracking_customer ON s02_deposit_tracking(customer_id);
CREATE INDEX idx_s02_tracking_date ON s02_deposit_tracking(deposit_date DESC);

-- ===== PRISON VIRTUELLE (BLOCAGE CRÉDIT) =====
CREATE TABLE IF NOT EXISTS credit_virtual_prison (
  id SERIAL PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  credit_id INTEGER NOT NULL,
  
  -- Raison blocage
  blocked_reason VARCHAR(100) NOT NULL, -- 'NON_PAYMENT', 'LATE_INTEREST', 'LEGAL_PURSUIT'
  
  -- Montants dus
  outstanding_principal_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  outstanding_principal_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  outstanding_interest_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  outstanding_interest_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  penalty_cdf NUMERIC(15,2) NOT NULL DEFAULT 0,
  penalty_usd NUMERIC(15,2) NOT NULL DEFAULT 0,
  
  -- Dates
  blocked_since TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP,
  
  -- Statut
  is_active BOOLEAN DEFAULT TRUE,
  days_blocked INTEGER DEFAULT 0,
  
  -- Conditions de sortie
  release_conditions TEXT,
  amount_paid_to_release_cdf NUMERIC(15,2),
  amount_paid_to_release_usd NUMERIC(15,2),
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_prison_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_prison_credit FOREIGN KEY (credit_id) REFERENCES credit_applications(id) ON DELETE CASCADE
);

CREATE INDEX idx_prison_customer ON credit_virtual_prison(customer_id);
CREATE INDEX idx_prison_active ON credit_virtual_prison(is_active);

-- ===== PARRAINAGE MOPAO =====
CREATE TABLE IF NOT EXISTS mopao_sponsorships (
  id SERIAL PRIMARY KEY,
  sponsor_customer_id INTEGER NOT NULL, -- Client GOLD
  sponsored_customer_id INTEGER NOT NULL, -- Client parrainé
  credit_id INTEGER NOT NULL,
  
  -- Garantie sponsor
  sponsor_guarantee_percentage NUMERIC(5,2) NOT NULL DEFAULT 40.00,
  sponsor_guarantee_amount_cdf NUMERIC(15,2) NOT NULL,
  sponsor_guarantee_amount_usd NUMERIC(15,2) NOT NULL,
  sponsor_s02_locked_amount_cdf NUMERIC(15,2), -- Montant gelé dans S02 sponsor
  sponsor_s02_locked_amount_usd NUMERIC(15,2),
  
  -- Statut
  is_active BOOLEAN DEFAULT TRUE,
  sponsor_liability_triggered BOOLEAN DEFAULT FALSE,
  sponsor_paid_cdf NUMERIC(15,2) DEFAULT 0,
  sponsor_paid_usd NUMERIC(15,2) DEFAULT 0,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TIMESTAMP,
  
  CONSTRAINT fk_sponsorship_sponsor FOREIGN KEY (sponsor_customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sponsorship_sponsored FOREIGN KEY (sponsored_customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
  CONSTRAINT fk_sponsorship_credit FOREIGN KEY (credit_id) REFERENCES credit_applications(id) ON DELETE CASCADE
);

CREATE INDEX idx_sponsorships_sponsor ON mopao_sponsorships(sponsor_customer_id);
CREATE INDEX idx_sponsorships_sponsored ON mopao_sponsorships(sponsored_customer_id);

-- ===== VUES UTILES =====

-- Vue: Crédits actifs avec solde
CREATE OR REPLACE VIEW active_credits AS
SELECT 
  ca.*,
  c.first_name,
  c.last_name,
  c.category,
  (ca.disbursed_amount_cdf - ca.total_paid_cdf + ca.total_late_interest_cdf) AS current_balance_cdf,
  (ca.disbursed_amount_usd - ca.total_paid_usd + ca.total_late_interest_usd) AS current_balance_usd
FROM credit_applications ca
JOIN customers c ON ca.customer_id = c.id
WHERE ca.status IN ('ACTIVE', 'DISBURSED');

-- Vue: Clients en retard
CREATE OR REPLACE VIEW customers_with_late_payments AS
SELECT DISTINCT
  c.id AS customer_id,
  c.first_name,
  c.last_name,
  ca.id AS credit_id,
  ca.product_type,
  COUNT(cr.*) AS late_payments_count,
  SUM(cr.amount_cdf) AS total_late_cdf,
  SUM(cr.amount_usd) AS total_late_usd
FROM customers c
JOIN credit_applications ca ON c.id = ca.customer_id
JOIN credit_repayments cr ON ca.id = cr.credit_id
WHERE cr.status IN ('LATE', 'MISSED')
GROUP BY c.id, ca.id;

-- ===== FONCTIONS UTILES =====

-- Calculer intérêt TELEMA/MOPAO selon durée et montant
CREATE OR REPLACE FUNCTION calculate_telema_interest_rate(
  amount_usd NUMERIC,
  duration_months INTEGER
) RETURNS NUMERIC AS $$
BEGIN
  IF duration_months = 12 THEN
    IF amount_usd BETWEEN 200 AND 500 THEN RETURN 5.50;
    ELSIF amount_usd BETWEEN 501 AND 1500 THEN RETURN 5.00;
    END IF;
  ELSIF duration_months = 9 THEN
    IF amount_usd BETWEEN 200 AND 500 THEN RETURN 5.30;
    ELSIF amount_usd BETWEEN 501 AND 1500 THEN RETURN 4.80;
    END IF;
  ELSIF duration_months = 6 THEN
    IF amount_usd BETWEEN 200 AND 500 THEN RETURN 5.00;
    ELSIF amount_usd BETWEEN 501 AND 1500 THEN RETURN 4.50;
    END IF;
  END IF;
  RETURN 5.00; -- Default
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculer frais traitement TELEMA
CREATE OR REPLACE FUNCTION calculate_telema_processing_fee(
  amount_usd NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
  IF amount_usd BETWEEN 200 AND 300 THEN RETURN 20;
  ELSIF amount_usd BETWEEN 301 AND 400 THEN RETURN 25;
  ELSIF amount_usd BETWEEN 401 AND 500 THEN RETURN 30;
  ELSIF amount_usd BETWEEN 501 AND 600 THEN RETURN 35;
  ELSIF amount_usd BETWEEN 601 AND 700 THEN RETURN 40;
  ELSIF amount_usd BETWEEN 701 AND 800 THEN RETURN 45;
  ELSIF amount_usd BETWEEN 801 AND 900 THEN RETURN 50;
  ELSIF amount_usd BETWEEN 901 AND 1000 THEN RETURN 55;
  ELSIF amount_usd BETWEEN 1001 AND 1100 THEN RETURN 60;
  ELSIF amount_usd BETWEEN 1101 AND 1200 THEN RETURN 65;
  ELSIF amount_usd BETWEEN 1201 AND 1300 THEN RETURN 70;
  ELSIF amount_usd BETWEEN 1301 AND 1400 THEN RETURN 75;
  ELSIF amount_usd BETWEEN 1401 AND 1500 THEN RETURN 80;
  END IF;
  RETURN 20; -- Default
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculer frais traitement BOMBÉ
CREATE OR REPLACE FUNCTION calculate_bombe_processing_fee(
  amount_usd NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
  IF amount_usd BETWEEN 10 AND 20 THEN RETURN 2;
  ELSIF amount_usd BETWEEN 21 AND 50 THEN RETURN 4;
  ELSIF amount_usd BETWEEN 51 AND 100 THEN RETURN 8;
  END IF;
  RETURN 2; -- Default
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger: Update updated_at
CREATE OR REPLACE FUNCTION update_credit_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_credit_updated_at
  BEFORE UPDATE ON credit_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_credit_updated_at();

-- Commentaires
COMMENT ON TABLE credit_applications IS 'Table principale pour tous les produits de crédit (BOMBÉ, TELEMA, MOPAO, VIMBISA, LIKELEMBA)';
COMMENT ON TABLE credit_repayments IS 'Historique des remboursements de crédit (quotidien/hebdomadaire/mensuel)';
COMMENT ON TABLE credit_notifications IS 'Notifications de rappel et alertes crédit (SMS/Email/Push)';
COMMENT ON TABLE bombe_renewal_history IS 'Historique des renouvellements automatiques BOMBÉ (chaque matin 4h)';
COMMENT ON TABLE s02_deposit_tracking IS 'Tracking dépôts S02 pour éligibilité crédit (26 jours consécutifs)';
COMMENT ON TABLE credit_virtual_prison IS 'Prison virtuelle - blocage crédit pour non-paiement';
COMMENT ON TABLE mopao_sponsorships IS 'Parrainage MOPAO - clients GOLD garantissent 40% pour parrainés';
