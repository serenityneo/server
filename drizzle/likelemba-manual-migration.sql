-- LIKÉLEMBA GROUPS TABLES MIGRATION
-- Manual migration for creating tontine/rotating savings groups

-- Create enums
DO $$ BEGIN
  CREATE TYPE group_status AS ENUM (
    'PENDING_APPROVAL',
    'APPROVED',
    'PENDING_MEMBERS',
    'ACTIVE',
    'PAUSED',
    'COMPLETED',
    'CANCELLED',
    'REJECTED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE member_status AS ENUM (
    'PENDING',
    'ACCEPTED',
    'REJECTED',
    'EXITED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM (
    'PENDING',
    'ACCEPTED',
    'REJECTED',
    'EXPIRED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE distribution_method AS ENUM (
    'LOTTERY',
    'BIDDING',
    'ROTATION',
    'NEED_BASED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Main groups table
CREATE TABLE IF NOT EXISTS likelemba_groups (
  id SERIAL PRIMARY KEY,
  creator_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  
  group_name VARCHAR(200) NOT NULL,
  group_description TEXT,
  
  monthly_contribution_usd NUMERIC(15, 2) NOT NULL,
  monthly_contribution_cdf NUMERIC(15, 2) DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  
  total_members INTEGER NOT NULL,
  current_members INTEGER DEFAULT 1,
  min_members INTEGER DEFAULT 3,
  max_members INTEGER DEFAULT 50,
  
  duration_months INTEGER NOT NULL DEFAULT 12,
  current_round INTEGER DEFAULT 1,
  total_rounds INTEGER,
  
  total_fund_per_round NUMERIC(15, 2) NOT NULL,
  interest_rate NUMERIC(5, 2) DEFAULT 0.50,
  total_interest_per_round NUMERIC(15, 2),
  
  distribution_method distribution_method DEFAULT 'LOTTERY',
  
  status group_status DEFAULT 'PENDING_APPROVAL',
  is_active BOOLEAN DEFAULT false,
  
  approved_by INTEGER,
  approved_at TIMESTAMP(3),
  rejected_by INTEGER,
  rejected_at TIMESTAMP(3),
  rejection_reason TEXT,
  
  start_date TIMESTAMP(3),
  end_date TIMESTAMP(3),
  next_distribution_date TIMESTAMP(3),
  
  late_payment_penalty_rate NUMERIC(5, 2) DEFAULT 2.00,
  max_missed_payments INTEGER DEFAULT 2,
  allow_early_exit BOOLEAN DEFAULT false,
  exit_penalty_percentage NUMERIC(5, 2) DEFAULT 10.00,
  
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_groups_creator ON likelemba_groups(creator_id);
CREATE INDEX IF NOT EXISTS idx_groups_status ON likelemba_groups(status);
CREATE INDEX IF NOT EXISTS idx_groups_active ON likelemba_groups(is_active);

-- Members table
CREATE TABLE IF NOT EXISTS likelemba_members (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES likelemba_groups(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  status member_status DEFAULT 'PENDING',
  is_creator BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  
  joined_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  exited_at TIMESTAMP(3),
  
  draw_position INTEGER,
  has_received_fund BOOLEAN DEFAULT false,
  received_fund_round INTEGER,
  received_fund_date TIMESTAMP(3),
  received_amount_usd NUMERIC(15, 2),
  received_amount_cdf NUMERIC(15, 2),
  
  total_contributions_usd NUMERIC(15, 2) DEFAULT 0,
  total_contributions_cdf NUMERIC(15, 2) DEFAULT 0,
  total_penalties_usd NUMERIC(15, 2) DEFAULT 0,
  total_penalties_cdf NUMERIC(15, 2) DEFAULT 0,
  missed_payments_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(group_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_members_group ON likelemba_members(group_id);
CREATE INDEX IF NOT EXISTS idx_members_customer ON likelemba_members(customer_id);

-- Invitations table
CREATE TABLE IF NOT EXISTS likelemba_invitations (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES likelemba_groups(id) ON DELETE CASCADE,
  
  invited_customer_id INTEGER,
  invited_name VARCHAR(200),
  invited_email VARCHAR(200),
  invited_phone VARCHAR(50),
  
  invited_by INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  
  status invitation_status DEFAULT 'PENDING',
  
  invitation_token VARCHAR(100),
  expires_at TIMESTAMP(3),
  
  responded_at TIMESTAMP(3),
  rejection_reason TEXT,
  
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invitations_group ON likelemba_invitations(group_id);
CREATE INDEX IF NOT EXISTS idx_invitations_customer ON likelemba_invitations(invited_customer_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON likelemba_invitations(invited_email);

-- Contributions table
CREATE TABLE IF NOT EXISTS likelemba_contributions (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES likelemba_groups(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES likelemba_members(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL,
  
  round_number INTEGER NOT NULL,
  contribution_month DATE NOT NULL,
  due_date DATE NOT NULL,
  
  expected_amount_usd NUMERIC(15, 2) NOT NULL,
  expected_amount_cdf NUMERIC(15, 2) DEFAULT 0,
  paid_amount_usd NUMERIC(15, 2) DEFAULT 0,
  paid_amount_cdf NUMERIC(15, 2) DEFAULT 0,
  
  penalty_amount_usd NUMERIC(15, 2) DEFAULT 0,
  penalty_amount_cdf NUMERIC(15, 2) DEFAULT 0,
  days_late INTEGER DEFAULT 0,
  
  is_paid BOOLEAN DEFAULT false,
  is_late BOOLEAN DEFAULT false,
  paid_at TIMESTAMP(3),
  
  transaction_id INTEGER,
  payment_method VARCHAR(50),
  
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(member_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_contributions_group ON likelemba_contributions(group_id);
CREATE INDEX IF NOT EXISTS idx_contributions_member ON likelemba_contributions(member_id);
CREATE INDEX IF NOT EXISTS idx_contributions_round ON likelemba_contributions(round_number);
CREATE INDEX IF NOT EXISTS idx_contributions_due_date ON likelemba_contributions(due_date);

-- Distributions table
CREATE TABLE IF NOT EXISTS likelemba_distributions (
  id SERIAL PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES likelemba_groups(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  
  winner_id INTEGER NOT NULL REFERENCES likelemba_members(id) ON DELETE CASCADE,
  winner_customer_id INTEGER NOT NULL,
  
  distributed_amount_usd NUMERIC(15, 2) NOT NULL,
  distributed_amount_cdf NUMERIC(15, 2) DEFAULT 0,
  interest_amount_usd NUMERIC(15, 2) DEFAULT 0,
  interest_amount_cdf NUMERIC(15, 2) DEFAULT 0,
  total_distributed_usd NUMERIC(15, 2) NOT NULL,
  total_distributed_cdf NUMERIC(15, 2) DEFAULT 0,
  
  distribution_method distribution_method NOT NULL,
  lottery_details JSONB,
  bidding_details JSONB,
  
  is_completed BOOLEAN DEFAULT false,
  is_paid BOOLEAN DEFAULT false,
  
  distribution_date TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP(3),
  
  transaction_id INTEGER,
  
  notes TEXT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(group_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_distributions_group ON likelemba_distributions(group_id);
CREATE INDEX IF NOT EXISTS idx_distributions_round ON likelemba_distributions(round_number);
CREATE INDEX IF NOT EXISTS idx_distributions_winner ON likelemba_distributions(winner_id);
