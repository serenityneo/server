/**
 * Create partner_kyc_completions table for tracking KYC completion by partners
 * This table provides complete audit trail for compliance
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

async function createPartnerKycCompletionTable() {
  try {
    console.log('🔧 Creating partner_kyc_completions table...');

    await pool.query(`
      -- Table for tracking partner KYC completion requests and authorizations
      CREATE TABLE IF NOT EXISTS partner_kyc_completions (
        id SERIAL PRIMARY KEY,
        
        -- Partner & Customer info
        partner_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        
        -- Authorization tracking
        authorization_requested_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        authorization_granted_at TIMESTAMP(3),
        authorization_expires_at TIMESTAMP(3),
        authorization_status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, GRANTED, EXPIRED, DENIED, REVOKED
        authorization_token TEXT UNIQUE, -- Unique token for this authorization session
        
        -- KYC completion tracking
        kyc_step_completed INTEGER, -- 1, 2, 3, 4 (which step was completed)
        completion_started_at TIMESTAMP(3),
        completion_finished_at TIMESTAMP(3),
        completion_status TEXT NOT NULL DEFAULT 'NOT_STARTED', -- NOT_STARTED, IN_PROGRESS, COMPLETED, FAILED
        
        -- Data filled by partner
        data_filled JSONB, -- Stores the KYC data filled by partner
        documents_uploaded JSONB, -- Array of document IDs uploaded
        
        -- Audit trail (Banking compliance requirement)
        partner_ip_address TEXT NOT NULL,
        partner_user_agent TEXT,
        partner_device_info JSONB,
        partner_location_data JSONB,
        partner_session_id TEXT,
        
        -- Application source (mobile vs web)
        application_source TEXT NOT NULL DEFAULT 'WEB', -- WEB, MOBILE_IOS, MOBILE_ANDROID
        
        -- Approval/Rejection by admin
        reviewed_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP(3),
        review_status TEXT, -- APPROVED, REJECTED, PENDING_REVIEW
        review_notes TEXT,
        rejection_reason TEXT,
        
        -- Notification tracking
        customer_notified BOOLEAN DEFAULT FALSE,
        customer_notified_at TIMESTAMP(3),
        notification_method TEXT, -- SMS, EMAIL, PUSH
        
        -- Lock mechanism (only one partner can edit at a time)
        is_locked BOOLEAN DEFAULT FALSE,
        locked_until TIMESTAMP(3),
        lock_reason TEXT,
        
        -- Metadata
        notes TEXT,
        metadata JSONB, -- Additional flexible data
        
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT valid_kyc_step CHECK (kyc_step_completed BETWEEN 1 AND 4),
        CONSTRAINT valid_authorization_status CHECK (
          authorization_status IN ('PENDING', 'GRANTED', 'EXPIRED', 'DENIED', 'REVOKED')
        ),
        CONSTRAINT valid_completion_status CHECK (
          completion_status IN ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED')
        ),
        CONSTRAINT valid_review_status CHECK (
          review_status IN ('APPROVED', 'REJECTED', 'PENDING_REVIEW') OR review_status IS NULL
        )
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_partner_kyc_partner_id ON partner_kyc_completions(partner_id);
      CREATE INDEX IF NOT EXISTS idx_partner_kyc_customer_id ON partner_kyc_completions(customer_id);
      CREATE INDEX IF NOT EXISTS idx_partner_kyc_authorization_token ON partner_kyc_completions(authorization_token);
      CREATE INDEX IF NOT EXISTS idx_partner_kyc_authorization_status ON partner_kyc_completions(authorization_status);
      CREATE INDEX IF NOT EXISTS idx_partner_kyc_completion_status ON partner_kyc_completions(completion_status);
      CREATE INDEX IF NOT EXISTS idx_partner_kyc_review_status ON partner_kyc_completions(review_status);
      CREATE INDEX IF NOT EXISTS idx_partner_kyc_is_locked ON partner_kyc_completions(is_locked);
      CREATE INDEX IF NOT EXISTS idx_partner_kyc_created_at ON partner_kyc_completions(created_at DESC);

      -- Composite indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_partner_customer_status 
        ON partner_kyc_completions(partner_id, customer_id, authorization_status);
      
      CREATE INDEX IF NOT EXISTS idx_customer_locked 
        ON partner_kyc_completions(customer_id, is_locked) 
        WHERE is_locked = TRUE;

      -- Function to auto-update updated_at
      CREATE OR REPLACE FUNCTION update_partner_kyc_completions_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Trigger
      DROP TRIGGER IF EXISTS trigger_update_partner_kyc_completions_updated_at ON partner_kyc_completions;
      CREATE TRIGGER trigger_update_partner_kyc_completions_updated_at
        BEFORE UPDATE ON partner_kyc_completions
        FOR EACH ROW
        EXECUTE FUNCTION update_partner_kyc_completions_updated_at();

      -- Add comment for documentation
      COMMENT ON TABLE partner_kyc_completions IS 
        'Tracks partner KYC completion requests with full audit trail for banking compliance. Includes authorization mechanism to prevent concurrent edits.';

      COMMENT ON COLUMN partner_kyc_completions.authorization_token IS 
        'Unique token issued when authorization is granted. Required for all KYC modification operations.';

      COMMENT ON COLUMN partner_kyc_completions.is_locked IS 
        'Prevents other partners from requesting authorization while locked. Automatically unlocked after timeout or completion.';

      COMMENT ON COLUMN partner_kyc_completions.customer_notified IS 
        'Tracks if customer was notified about KYC completion. Important for regulatory compliance.';

      COMMENT ON COLUMN partner_kyc_completions.review_status IS 
        'Admin review status. NULL means not yet reviewed. APPROVED means KYC can be finalized.';
    `);

    console.log('✅ partner_kyc_completions table created successfully!');

    -- Add partner support to existing card_requests table
    console.log('🔧 Adding partner support to card_requests table...');

    await pool.query(`
      -- Add partner-related columns to existing card_requests table
      ALTER TABLE card_requests 
        ADD COLUMN IF NOT EXISTS requested_by_partner_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS partner_ip_address TEXT,
        ADD COLUMN IF NOT EXISTS partner_user_agent TEXT,
        ADD COLUMN IF NOT EXISTS partner_device_info JSONB,
        ADD COLUMN IF NOT EXISTS is_partner_request BOOLEAN DEFAULT FALSE;
      
      -- Create index for partner requests
      CREATE INDEX IF NOT EXISTS idx_card_requests_partner_id ON card_requests(requested_by_partner_id);
      CREATE INDEX IF NOT EXISTS idx_card_requests_is_partner ON card_requests(is_partner_request);
      
      COMMENT ON COLUMN card_requests.requested_by_partner_id IS 
        'Partner who submitted this card request on behalf of customer. NULL if customer did it themselves.';
    `);

    console.log('✅ card_requests table updated for partner support!');

    -- Create card cancellation request table
    console.log('🔧 Creating card_cancellation_requests table...');

    await pool.query(`
      -- Table for card cancellation/renewal requests (partner/customer requests, admin approves)
      CREATE TABLE IF NOT EXISTS card_cancellation_requests (
        id SERIAL PRIMARY KEY,
        
        -- Request info
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        card_request_id INTEGER REFERENCES card_requests(id) ON DELETE CASCADE,
        requested_by_partner_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        is_partner_request BOOLEAN DEFAULT FALSE,
        
        -- Card information
        card_number TEXT NOT NULL,
        card_type TEXT, -- For reference
        
        -- Request type and details
        request_type TEXT NOT NULL DEFAULT 'CANCELLATION', -- CANCELLATION, RENEWAL
        cancellation_reason TEXT,
        renewal_reason TEXT,
        additional_notes TEXT,
        urgency_level TEXT NOT NULL DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, URGENT
        
        -- Status
        status TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, CANCELLED, PROCESSED
        
        -- Admin review
        reviewed_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMP(3),
        review_notes TEXT,
        rejection_reason TEXT,
        approval_notes TEXT,
        
        -- Processing
        processed_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        processed_at TIMESTAMP(3),
        processing_notes TEXT,
        new_card_request_id INTEGER REFERENCES card_requests(id) ON DELETE SET NULL, -- For renewals
        
        -- Audit trail
        requester_ip_address TEXT NOT NULL,
        requester_user_agent TEXT,
        requester_device_info JSONB,
        application_source TEXT NOT NULL DEFAULT 'WEB',
        
        -- Notification
        customer_notified BOOLEAN DEFAULT FALSE,
        customer_notified_at TIMESTAMP(3),
        partner_notified BOOLEAN DEFAULT FALSE,
        partner_notified_at TIMESTAMP(3),
        
        -- Metadata
        metadata JSONB,
        
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        CONSTRAINT valid_request_type CHECK (
          request_type IN ('CANCELLATION', 'RENEWAL')
        ),
        CONSTRAINT valid_urgency_level CHECK (
          urgency_level IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')
        ),
        CONSTRAINT valid_cancellation_status CHECK (
          status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'PROCESSED')
        )
      );

      -- Indexes for performance
      CREATE INDEX IF NOT EXISTS idx_card_cancel_customer_id ON card_cancellation_requests(customer_id);
      CREATE INDEX IF NOT EXISTS idx_card_cancel_partner_id ON card_cancellation_requests(requested_by_partner_id);
      CREATE INDEX IF NOT EXISTS idx_card_cancel_card_number ON card_cancellation_requests(card_number);
      CREATE INDEX IF NOT EXISTS idx_card_cancel_card_request_id ON card_cancellation_requests(card_request_id);
      CREATE INDEX IF NOT EXISTS idx_card_cancel_status ON card_cancellation_requests(status);
      CREATE INDEX IF NOT EXISTS idx_card_cancel_request_type ON card_cancellation_requests(request_type);
      CREATE INDEX IF NOT EXISTS idx_card_cancel_is_partner ON card_cancellation_requests(is_partner_request);
      CREATE INDEX IF NOT EXISTS idx_card_cancel_created_at ON card_cancellation_requests(created_at DESC);
      
      -- Composite index for common queries
      CREATE INDEX IF NOT EXISTS idx_card_cancel_status_type ON card_cancellation_requests(status, request_type);

      -- Auto-update trigger
      CREATE TRIGGER trigger_update_card_cancellation_requests_updated_at
        BEFORE UPDATE ON card_cancellation_requests
        FOR EACH ROW
        EXECUTE FUNCTION update_partner_kyc_completions_updated_at();

      COMMENT ON TABLE card_cancellation_requests IS 
        'Card cancellation and renewal requests. Can be submitted by customers or partners. Requires admin approval.';
      
      COMMENT ON COLUMN card_cancellation_requests.requested_by_partner_id IS 
        'Partner who submitted this request on behalf of customer. NULL if customer did it themselves.';
    `);

    console.log('✅ card_cancellation_requests table created successfully!');

    console.log('\n🎉 All tables created/updated successfully!');
    console.log('\n📊 Summary:');
    console.log('   ✓ partner_kyc_completions - Partner KYC completion tracking');
    console.log('   ✓ card_requests - Extended with partner support');
    console.log('   ✓ card_cancellation_requests - Card cancellation/renewal workflow');
    console.log('\n💡 Features:');
    console.log('   ✓ Authorization mechanism (token-based for KYC)');
    console.log('   ✓ Lock system (one partner at a time for KYC)');
    console.log('   ✓ Complete audit trail (IP, device, location)');
    console.log('   ✓ Customer & Partner notification tracking');
    console.log('   ✓ Admin review workflow for all requests');
    console.log('   ✓ Support for both customer and partner requests');
    console.log('   ✓ Automatic timestamp updates');

  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

createPartnerKycCompletionTable();
