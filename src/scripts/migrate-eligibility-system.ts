/**
 * Migration script for Dynamic Eligibility System
 * Creates the following tables:
 * - service_conditions: Conditions for credit services (BOMBÉ, TELEMA, etc.)
 * - customer_eligibility_status: Track each user's eligibility for accounts + services
 * - customer_notifications: Smart notifications per customer
 * - eligibility_evaluation_logs: Audit log for eligibility evaluations
 * 
 * Usage: npx ts-node src/scripts/migrate-eligibility-system.ts
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('🚀 Starting Eligibility System Migration...\n');

  try {
    // Step 1: Create enums
    console.log('📋 Step 1: Creating enums...');
    
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "NotificationType" AS ENUM ('CELEBRATION', 'PROGRESS', 'MOTIVATION', 'ALERT', 'REMINDER', 'SYSTEM');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('  ✅ NotificationType enum created');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('  ✅ NotificationPriority enum created');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "EligibilityTargetType" AS ENUM ('ACCOUNT', 'SERVICE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('  ✅ EligibilityTargetType enum created');

    await db.execute(sql`
      DO $$ BEGIN
        CREATE TYPE "ConditionOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'IN', 'NOT_IN', 'BETWEEN', 'CONTAINS');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('  ✅ ConditionOperator enum created');

    // Step 2: Create service_conditions table
    console.log('\n📋 Step 2: Creating service_conditions table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "service_conditions" (
        "id" SERIAL PRIMARY KEY NOT NULL,
        "service_code" VARCHAR(20) NOT NULL,
        "condition_type" VARCHAR(50) NOT NULL,
        "condition_key" VARCHAR(100) NOT NULL,
        "condition_label" TEXT NOT NULL,
        "condition_description" TEXT,
        "operator" "ConditionOperator" DEFAULT 'GREATER_THAN_OR_EQUAL' NOT NULL,
        "required_value" JSONB NOT NULL,
        "validation_query" TEXT,
        "weight" INTEGER DEFAULT 10 NOT NULL,
        "display_order" INTEGER DEFAULT 0 NOT NULL,
        "is_active" BOOLEAN DEFAULT true NOT NULL,
        "is_mandatory" BOOLEAN DEFAULT true NOT NULL,
        "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    console.log('  ✅ service_conditions table created');

    // Create indexes for service_conditions
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "service_conditions_service_code_idx" ON "service_conditions" ("service_code");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "service_conditions_type_idx" ON "service_conditions" ("condition_type");
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "service_conditions_service_code_condition_key_key" 
      ON "service_conditions" ("service_code", "condition_key");
    `);
    console.log('  ✅ service_conditions indexes created');

    // Step 3: Create customer_eligibility_status table
    console.log('\n📋 Step 3: Creating customer_eligibility_status table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "customer_eligibility_status" (
        "id" SERIAL PRIMARY KEY NOT NULL,
        "customer_id" INTEGER NOT NULL,
        "target_type" "EligibilityTargetType" NOT NULL,
        "target_code" VARCHAR(20) NOT NULL,
        "is_eligible" BOOLEAN DEFAULT false NOT NULL,
        "is_activated" BOOLEAN DEFAULT false NOT NULL,
        "eligibility_score" NUMERIC(5, 2) DEFAULT '0' NOT NULL,
        "conditions_met" JSONB,
        "conditions_missing" JSONB,
        "progress_percentage" NUMERIC(5, 2) DEFAULT '0' NOT NULL,
        "estimated_days_to_eligibility" INTEGER,
        "last_evaluated_at" TIMESTAMP(3),
        "eligible_since" TIMESTAMP(3),
        "activated_at" TIMESTAMP(3),
        "last_notified_at" TIMESTAMP(3),
        "auto_activate_when_eligible" BOOLEAN DEFAULT true NOT NULL,
        "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "customer_eligibility_status_customer_id_fkey" 
          FOREIGN KEY ("customer_id") REFERENCES "customers"("id") 
          ON UPDATE CASCADE ON DELETE CASCADE
      );
    `);
    console.log('  ✅ customer_eligibility_status table created');

    // Create indexes for customer_eligibility_status
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS "customer_eligibility_status_customer_target_key" 
      ON "customer_eligibility_status" ("customer_id", "target_type", "target_code");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "customer_eligibility_status_customer_id_idx" 
      ON "customer_eligibility_status" ("customer_id");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "customer_eligibility_status_is_eligible_idx" 
      ON "customer_eligibility_status" ("is_eligible");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "customer_eligibility_status_target_type_idx" 
      ON "customer_eligibility_status" ("target_type");
    `);
    console.log('  ✅ customer_eligibility_status indexes created');

    // Step 4: Create customer_notifications table
    console.log('\n📋 Step 4: Creating customer_notifications table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "customer_notifications" (
        "id" SERIAL PRIMARY KEY NOT NULL,
        "customer_id" INTEGER NOT NULL,
        "notification_type" "NotificationType" NOT NULL,
        "priority" "NotificationPriority" DEFAULT 'MEDIUM' NOT NULL,
        "title" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "action_label" TEXT,
        "action_url" TEXT,
        "icon" TEXT,
        "target_type" "EligibilityTargetType",
        "target_code" VARCHAR(20),
        "display_duration_seconds" INTEGER DEFAULT 300 NOT NULL,
        "is_repeatable" BOOLEAN DEFAULT false NOT NULL,
        "repeat_interval_hours" INTEGER,
        "is_read" BOOLEAN DEFAULT false NOT NULL,
        "is_dismissed" BOOLEAN DEFAULT false NOT NULL,
        "is_action_taken" BOOLEAN DEFAULT false NOT NULL,
        "read_at" TIMESTAMP(3),
        "dismissed_at" TIMESTAMP(3),
        "action_taken_at" TIMESTAMP(3),
        "scheduled_for" TIMESTAMP(3),
        "expires_at" TIMESTAMP(3),
        "last_shown_at" TIMESTAMP(3),
        "shown_count" INTEGER DEFAULT 0 NOT NULL,
        "metadata" JSONB,
        "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        "updated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "customer_notifications_customer_id_fkey" 
          FOREIGN KEY ("customer_id") REFERENCES "customers"("id") 
          ON UPDATE CASCADE ON DELETE CASCADE
      );
    `);
    console.log('  ✅ customer_notifications table created');

    // Create indexes for customer_notifications
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "customer_notifications_customer_id_idx" 
      ON "customer_notifications" ("customer_id");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "customer_notifications_type_idx" 
      ON "customer_notifications" ("notification_type");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "customer_notifications_is_read_idx" 
      ON "customer_notifications" ("is_read");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "customer_notifications_scheduled_for_idx" 
      ON "customer_notifications" ("scheduled_for");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "customer_notifications_created_at_idx" 
      ON "customer_notifications" ("created_at" DESC);
    `);
    console.log('  ✅ customer_notifications indexes created');

    // Step 5: Create eligibility_evaluation_logs table
    console.log('\n📋 Step 5: Creating eligibility_evaluation_logs table...');
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "eligibility_evaluation_logs" (
        "id" SERIAL PRIMARY KEY NOT NULL,
        "customer_id" INTEGER NOT NULL,
        "target_type" "EligibilityTargetType" NOT NULL,
        "target_code" VARCHAR(20) NOT NULL,
        "previous_eligibility" BOOLEAN,
        "new_eligibility" BOOLEAN NOT NULL,
        "previous_score" NUMERIC(5, 2),
        "new_score" NUMERIC(5, 2) NOT NULL,
        "conditions_evaluated" JSONB NOT NULL,
        "trigger_event" TEXT,
        "action_taken" TEXT,
        "notification_id" INTEGER,
        "evaluated_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "eligibility_evaluation_logs_customer_id_fkey" 
          FOREIGN KEY ("customer_id") REFERENCES "customers"("id") 
          ON UPDATE CASCADE ON DELETE CASCADE
      );
    `);
    console.log('  ✅ eligibility_evaluation_logs table created');

    // Create indexes for eligibility_evaluation_logs
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "eligibility_evaluation_logs_customer_id_idx" 
      ON "eligibility_evaluation_logs" ("customer_id");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "eligibility_evaluation_logs_target_idx" 
      ON "eligibility_evaluation_logs" ("target_type", "target_code");
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "eligibility_evaluation_logs_evaluated_at_idx" 
      ON "eligibility_evaluation_logs" ("evaluated_at" DESC);
    `);
    console.log('  ✅ eligibility_evaluation_logs indexes created');

    console.log('\n✅ ═══════════════════════════════════════════════════════════');
    console.log('✅ MIGRATION COMPLETE!');
    console.log('✅ ═══════════════════════════════════════════════════════════');
    console.log('\n📊 Tables created:');
    console.log('   • service_conditions - Credit service conditions (BOMBÉ, TELEMA, etc.)');
    console.log('   • customer_eligibility_status - User eligibility tracking');
    console.log('   • customer_notifications - Smart notifications');
    console.log('   • eligibility_evaluation_logs - Audit trail');
    console.log('\n🔜 Next step: Run seed-service-conditions.ts to populate conditions');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  }
}

// Execute
migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
