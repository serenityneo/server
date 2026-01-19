-- Migration: Create request_logs table for performance monitoring
-- Purpose: Track all API requests with P95 performance metrics

-- Create enum for request source
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RequestSource') THEN
    CREATE TYPE "RequestSource" AS ENUM ('UI', 'SERVER');
  END IF;
END$$;

-- Create request_logs table
CREATE TABLE IF NOT EXISTS "request_logs" (
  "id" TEXT PRIMARY KEY,
  "endpoint" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "duration_ms" INTEGER NOT NULL,
  "status_code" INTEGER,
  "customer_id" INTEGER,
  "action_type" TEXT,
  "source" "RequestSource" NOT NULL DEFAULT 'SERVER',
  "ip_address" TEXT,
  "user_agent" TEXT,
  "request_body" JSONB,
  "response_size" INTEGER,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "date" DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS "request_logs_endpoint_idx" ON "request_logs"("endpoint");
CREATE INDEX IF NOT EXISTS "request_logs_duration_idx" ON "request_logs"("duration_ms" DESC);
CREATE INDEX IF NOT EXISTS "request_logs_customer_id_idx" ON "request_logs"("customer_id");
CREATE INDEX IF NOT EXISTS "request_logs_date_idx" ON "request_logs"("date" DESC);
CREATE INDEX IF NOT EXISTS "request_logs_created_at_idx" ON "request_logs"("created_at" DESC);
CREATE INDEX IF NOT EXISTS "request_logs_source_idx" ON "request_logs"("source");
CREATE INDEX IF NOT EXISTS "request_logs_slow_queries_idx" ON "request_logs"("duration_ms" DESC, "endpoint") WHERE "duration_ms" > 200;

-- Foreign key constraint to customers table (optional, for customer tracking)
-- ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_customer_id_fkey" 
--   FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Comment for documentation
COMMENT ON TABLE "request_logs" IS 'Performance monitoring: tracks all API requests for P95 analysis and slow query detection';
COMMENT ON COLUMN "request_logs"."duration_ms" IS 'Request duration in milliseconds - used for P95 calculation';
COMMENT ON COLUMN "request_logs"."action_type" IS 'Business action being performed (e.g., kyc_submit, login, transfer)';
COMMENT ON COLUMN "request_logs"."source" IS 'Request origin: UI (Next.js) or SERVER (Fastify)';
