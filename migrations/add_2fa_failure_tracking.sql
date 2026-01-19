-- Migration: Add 2FA failure tracking columns to users table
-- Purpose: Enable intelligent error handling for 2FA verification failures
-- Date: 2025-12-08

-- Add failure tracking columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS mfa_failed_attempts INTEGER DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS mfa_last_failed_at TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS mfa_failure_log JSONB;

-- Add comment for documentation
COMMENT ON COLUMN users.mfa_failed_attempts IS 'Counter for consecutive failed 2FA verification attempts';
COMMENT ON COLUMN users.mfa_last_failed_at IS 'Timestamp of the last failed 2FA verification attempt';
COMMENT ON COLUMN users.mfa_failure_log IS 'Detailed diagnostic information about 2FA failures (timestamps, codes, time deltas)';
