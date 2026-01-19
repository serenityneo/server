-- =====================================================
-- S04 CREDIT ALLOCATION SYSTEM - DATABASE MIGRATION
-- =====================================================
-- This migration creates all tables needed for the S04 credit allocation system
-- Features: Allocation buffer, Credit requests, Repayments, Whitelist/Blacklist

-- S04 Allocation - Buffer account (compte tampon) for credit management
CREATE TABLE IF NOT EXISTS "s04_allocations" (
  "id" SERIAL PRIMARY KEY,
  "customer_id" INTEGER NOT NULL,
  "s04_account_id" INTEGER NOT NULL,
  "currency" TEXT DEFAULT 'USD' NOT NULL,
  "total_allocated" NUMERIC(15, 2) DEFAULT '0' NOT NULL,
  "total_debt" NUMERIC(15, 2) DEFAULT '0' NOT NULL,
  "available_balance" NUMERIC(15, 2) DEFAULT '0' NOT NULL,
  "commission_rate" NUMERIC(5, 4) DEFAULT '0.10' NOT NULL,
  "commission_collected" NUMERIC(15, 2) DEFAULT '0' NOT NULL,
  "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "s04_allocations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "s04_allocations_s04_account_id_fkey" FOREIGN KEY ("s04_account_id") REFERENCES "accounts"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "s04_allocations_customer_id_s04_account_id_currency_key" ON "s04_allocations" ("customer_id", "s04_account_id", "currency");
CREATE INDEX IF NOT EXISTS "s04_allocations_customer_id_idx" ON "s04_allocations" ("customer_id");
CREATE INDEX IF NOT EXISTS "s04_allocations_s04_account_id_idx" ON "s04_allocations" ("s04_account_id");

-- Credit Requests - Demandes de crédit pour S04
CREATE TABLE IF NOT EXISTS "credit_requests" (
  "id" SERIAL PRIMARY KEY,
  "customer_id" INTEGER NOT NULL,
  "s04_account_id" INTEGER NOT NULL,
  "allocation_id" INTEGER NOT NULL,
  "request_number" TEXT NOT NULL UNIQUE,
  "amount_requested" NUMERIC(15, 2) NOT NULL,
  "amount_approved" NUMERIC(15, 2),
  "commission_amount" NUMERIC(15, 2) DEFAULT '0' NOT NULL,
  "net_amount" NUMERIC(15, 2),
  "currency" TEXT DEFAULT 'USD' NOT NULL,
  "status" TEXT DEFAULT 'PENDING' NOT NULL,
  "requested_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "approved_at" TIMESTAMP(3),
  "disbursed_at" TIMESTAMP(3),
  "approved_by" INTEGER,
  "rejection_reason" TEXT,
  "due_date" TIMESTAMP(3),
  "repayment_status" TEXT DEFAULT 'UNPAID' NOT NULL,
  "amount_repaid" NUMERIC(15, 2) DEFAULT '0' NOT NULL,
  "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "credit_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "credit_requests_s04_account_id_fkey" FOREIGN KEY ("s04_account_id") REFERENCES "accounts"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "credit_requests_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "s04_allocations"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_requests_request_number_key" ON "credit_requests" ("request_number");
CREATE INDEX IF NOT EXISTS "credit_requests_customer_id_idx" ON "credit_requests" ("customer_id");
CREATE INDEX IF NOT EXISTS "credit_requests_status_idx" ON "credit_requests" ("status");
CREATE INDEX IF NOT EXISTS "credit_requests_allocation_id_idx" ON "credit_requests" ("allocation_id");

-- Credit Repayments - Historique des remboursements
CREATE TABLE IF NOT EXISTS "credit_repayments" (
  "id" SERIAL PRIMARY KEY,
  "credit_request_id" INTEGER NOT NULL,
  "customer_id" INTEGER NOT NULL,
  "allocation_id" INTEGER NOT NULL,
  "amount" NUMERIC(15, 2) NOT NULL,
  "currency" TEXT DEFAULT 'USD' NOT NULL,
  "payment_method" TEXT,
  "source_account_id" INTEGER,
  "repaid_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "processed_by" INTEGER,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "credit_repayments_credit_request_id_fkey" FOREIGN KEY ("credit_request_id") REFERENCES "credit_requests"("id") ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT "credit_repayments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "credit_repayments_credit_request_id_idx" ON "credit_repayments" ("credit_request_id");
CREATE INDEX IF NOT EXISTS "credit_repayments_customer_id_idx" ON "credit_repayments" ("customer_id");

-- Customer Credit Eligibility - Whitelist/Blacklist
CREATE TABLE IF NOT EXISTS "customer_credit_eligibility" (
  "id" SERIAL PRIMARY KEY,
  "customer_id" INTEGER NOT NULL UNIQUE,
  "eligibility_status" TEXT DEFAULT 'NEUTRAL' NOT NULL,
  "credit_score" INTEGER DEFAULT 0 NOT NULL,
  "max_credit_limit" NUMERIC(15, 2) DEFAULT '0' NOT NULL,
  "current_credit_used" NUMERIC(15, 2) DEFAULT '0' NOT NULL,
  "total_loans_completed" INTEGER DEFAULT 0 NOT NULL,
  "total_loans_defaulted" INTEGER DEFAULT 0 NOT NULL,
  "on_time_repayment_rate" NUMERIC(5, 2) DEFAULT '0' NOT NULL,
  "blacklist_reason" TEXT,
  "blacklisted_at" TIMESTAMP(3),
  "blacklisted_by" INTEGER,
  "whitelist_reason" TEXT,
  "whitelisted_at" TIMESTAMP(3),
  "whitelisted_by" INTEGER,
  "last_review_date" TIMESTAMP(3),
  "next_review_date" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "customer_credit_eligibility_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_credit_eligibility_customer_id_key" ON "customer_credit_eligibility" ("customer_id");
CREATE INDEX IF NOT EXISTS "customer_credit_eligibility_eligibility_status_idx" ON "customer_credit_eligibility" ("eligibility_status");

-- =====================================================
-- TRIGGERS FOR AUTO-UPDATE TIMESTAMPS
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_s04_allocations_updated_at BEFORE UPDATE ON "s04_allocations"
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_credit_requests_updated_at BEFORE UPDATE ON "credit_requests"
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customer_credit_eligibility_updated_at BEFORE UPDATE ON "customer_credit_eligibility"
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '✅ S04 Credit Allocation System tables created successfully!';
END $$;
