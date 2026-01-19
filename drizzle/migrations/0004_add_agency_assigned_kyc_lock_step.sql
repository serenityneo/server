-- Migration: Add AGENCY_ASSIGNED value to KycLockStep enum
-- Date: 2025-12-26
-- Purpose: Support completed KYC state tracking

-- Add new enum value to KycLockStep
ALTER TYPE "public"."KycLockStep" ADD VALUE IF NOT EXISTS 'AGENCY_ASSIGNED';

-- This migration is safe and can be run multiple times (idempotent)
-- The IF NOT EXISTS clause prevents errors if the value already exists
