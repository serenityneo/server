-- Migration: Add 2FA error reports table
-- Purpose: Store customer 2FA authentication error reports with screenshots and diagnostics
-- Date: 2025-12-08

CREATE TABLE IF NOT EXISTS two_factor_error_reports (
    id SERIAL PRIMARY KEY,
    
    -- User information (can be null if error occurs before authentication)
    customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
    user_email TEXT,
    user_phone TEXT,
    
    -- Error context
    error_type TEXT NOT NULL CHECK (error_type IN ('LOGIN_FAILED', 'CODE_REJECTED', 'TIMEOUT', 'OTHER')),
    error_message TEXT,
    user_description TEXT, -- User's description of the issue
    
    -- Technical details
    failed_attempts INTEGER DEFAULT 0 NOT NULL,
    authenticator_app TEXT, -- e.g., 'Google Authenticator', 'Authy', 'Microsoft Authenticator'
    
    -- Screenshot and diagnostics
    screenshot_url TEXT,
    screenshot_filename TEXT,
    
    -- Device and browser context
    device_info JSONB, -- { browser, os, device, etc. }
    ip_address TEXT,
    user_agent TEXT,
    
    -- Admin management
    status TEXT DEFAULT 'PENDING' NOT NULL CHECK (status IN ('PENDING', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
    assigned_to INTEGER REFERENCES users(id) ON DELETE SET NULL, -- Admin user handling the report
    admin_notes TEXT,
    resolution_notes TEXT,
    resolved_at TIMESTAMP(3),
    
    -- Email delivery tracking
    email_sent BOOLEAN DEFAULT FALSE NOT NULL,
    email_sent_at TIMESTAMP(3),
    email_error TEXT,
    
    -- Timestamps
    created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for efficient queries
CREATE INDEX idx_2fa_error_reports_customer_id ON two_factor_error_reports(customer_id);
CREATE INDEX idx_2fa_error_reports_status ON two_factor_error_reports(status);
CREATE INDEX idx_2fa_error_reports_created_at ON two_factor_error_reports(created_at DESC);
CREATE INDEX idx_2fa_error_reports_error_type ON two_factor_error_reports(error_type);
CREATE INDEX idx_2fa_error_reports_assigned_to ON two_factor_error_reports(assigned_to);

-- Comments for documentation
COMMENT ON TABLE two_factor_error_reports IS 'Stores customer 2FA authentication error reports with diagnostics and admin management';
COMMENT ON COLUMN two_factor_error_reports.customer_id IS 'Optional link to customer if authenticated';
COMMENT ON COLUMN two_factor_error_reports.screenshot_url IS 'URL to user-provided screenshot of the error';
COMMENT ON COLUMN two_factor_error_reports.device_info IS 'JSON object with browser, OS, device information';
COMMENT ON COLUMN two_factor_error_reports.email_sent IS 'Whether the error report was successfully sent to support email';
