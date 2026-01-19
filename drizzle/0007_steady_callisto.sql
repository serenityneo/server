CREATE TYPE "public"."ConditionOperator" AS ENUM('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'IN', 'NOT_IN', 'BETWEEN', 'CONTAINS');--> statement-breakpoint
CREATE TYPE "public"."EligibilityTargetType" AS ENUM('ACCOUNT', 'SERVICE');--> statement-breakpoint
CREATE TYPE "public"."NotificationPriority" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'URGENT');--> statement-breakpoint
CREATE TYPE "public"."NotificationType" AS ENUM('CELEBRATION', 'PROGRESS', 'MOTIVATION', 'ALERT', 'REMINDER', 'SYSTEM');--> statement-breakpoint
ALTER TYPE "public"."KYCStatus" ADD VALUE 'KYC1_UNDER_REVIEW' BEFORE 'KYC1_COMPLETED';--> statement-breakpoint
ALTER TYPE "public"."KYCStatus" ADD VALUE 'KYC1_VERIFIED' BEFORE 'KYC2_PENDING';--> statement-breakpoint
ALTER TYPE "public"."KYCStatus" ADD VALUE 'KYC1_REJECTED' BEFORE 'KYC2_PENDING';--> statement-breakpoint
ALTER TYPE "public"."KYCStatus" ADD VALUE 'KYC2_REJECTED' BEFORE 'REJECTED';--> statement-breakpoint
ALTER TYPE "public"."KYCStatus" ADD VALUE 'KYC3_PENDING' BEFORE 'REJECTED';--> statement-breakpoint
ALTER TYPE "public"."KYCStatus" ADD VALUE 'KYC3_UNDER_REVIEW' BEFORE 'REJECTED';--> statement-breakpoint
ALTER TYPE "public"."KYCStatus" ADD VALUE 'KYC3_VERIFIED' BEFORE 'REJECTED';--> statement-breakpoint
ALTER TYPE "public"."KYCStatus" ADD VALUE 'KYC3_REJECTED' BEFORE 'REJECTED';--> statement-breakpoint
CREATE TABLE "account_type_conditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_type_code" varchar(3) NOT NULL,
	"condition_type" varchar(50) NOT NULL,
	"condition_key" varchar(100) NOT NULL,
	"condition_label" text NOT NULL,
	"condition_description" text,
	"required_value" jsonb,
	"validation_rule" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_eligibility_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"target_type" "EligibilityTargetType" NOT NULL,
	"target_code" varchar(20) NOT NULL,
	"is_eligible" boolean DEFAULT false NOT NULL,
	"is_activated" boolean DEFAULT false NOT NULL,
	"eligibility_score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"conditions_met" jsonb,
	"conditions_missing" jsonb,
	"progress_percentage" numeric(5, 2) DEFAULT '0' NOT NULL,
	"estimated_days_to_eligibility" integer,
	"last_evaluated_at" timestamp(3),
	"eligible_since" timestamp(3),
	"activated_at" timestamp(3),
	"last_notified_at" timestamp(3),
	"auto_activate_when_eligible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"notification_type" "NotificationType" NOT NULL,
	"priority" "NotificationPriority" DEFAULT 'MEDIUM' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"action_label" text,
	"action_url" text,
	"icon" text,
	"target_type" "EligibilityTargetType",
	"target_code" varchar(20),
	"display_duration_seconds" integer DEFAULT 300 NOT NULL,
	"is_repeatable" boolean DEFAULT false NOT NULL,
	"repeat_interval_hours" integer,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_dismissed" boolean DEFAULT false NOT NULL,
	"is_action_taken" boolean DEFAULT false NOT NULL,
	"read_at" timestamp(3),
	"dismissed_at" timestamp(3),
	"action_taken_at" timestamp(3),
	"scheduled_for" timestamp(3),
	"expires_at" timestamp(3),
	"last_shown_at" timestamp(3),
	"shown_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eligibility_evaluation_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"target_type" "EligibilityTargetType" NOT NULL,
	"target_code" varchar(20) NOT NULL,
	"previous_eligibility" boolean,
	"new_eligibility" boolean NOT NULL,
	"previous_score" numeric(5, 2),
	"new_score" numeric(5, 2) NOT NULL,
	"conditions_evaluated" jsonb NOT NULL,
	"trigger_event" text,
	"action_taken" text,
	"notification_id" integer,
	"evaluated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_conditions" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_code" varchar(20) NOT NULL,
	"condition_type" varchar(50) NOT NULL,
	"condition_key" varchar(100) NOT NULL,
	"condition_label" text NOT NULL,
	"condition_description" text,
	"operator" "ConditionOperator" DEFAULT 'GREATER_THAN_OR_EQUAL' NOT NULL,
	"required_value" jsonb NOT NULL,
	"validation_query" text,
	"weight" integer DEFAULT 10 NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_mandatory" boolean DEFAULT true NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "password_changed_after_creation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "terms_accepted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "terms_accepted_at" timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "terms_accepted_ip" text;--> statement-breakpoint
ALTER TABLE "customer_eligibility_status" ADD CONSTRAINT "customer_eligibility_status_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_notifications" ADD CONSTRAINT "customer_notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "eligibility_evaluation_logs" ADD CONSTRAINT "eligibility_evaluation_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "service_conditions" ADD CONSTRAINT "service_conditions_service_code_fkey" FOREIGN KEY ("service_code") REFERENCES "public"."credit_types"("code") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "account_type_conditions_code_idx" ON "account_type_conditions" USING btree ("account_type_code" text_ops);--> statement-breakpoint
CREATE INDEX "account_type_conditions_type_idx" ON "account_type_conditions" USING btree ("condition_type" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "customer_eligibility_status_customer_target_key" ON "customer_eligibility_status" USING btree ("customer_id" int4_ops,"target_type" text_ops,"target_code" text_ops);--> statement-breakpoint
CREATE INDEX "customer_eligibility_status_customer_id_idx" ON "customer_eligibility_status" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "customer_eligibility_status_is_eligible_idx" ON "customer_eligibility_status" USING btree ("is_eligible" bool_ops);--> statement-breakpoint
CREATE INDEX "customer_eligibility_status_target_type_idx" ON "customer_eligibility_status" USING btree ("target_type" text_ops);--> statement-breakpoint
CREATE INDEX "customer_notifications_customer_id_idx" ON "customer_notifications" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "customer_notifications_type_idx" ON "customer_notifications" USING btree ("notification_type" text_ops);--> statement-breakpoint
CREATE INDEX "customer_notifications_is_read_idx" ON "customer_notifications" USING btree ("is_read" bool_ops);--> statement-breakpoint
CREATE INDEX "customer_notifications_scheduled_for_idx" ON "customer_notifications" USING btree ("scheduled_for" timestamp_ops);--> statement-breakpoint
CREATE INDEX "customer_notifications_created_at_idx" ON "customer_notifications" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "eligibility_evaluation_logs_customer_id_idx" ON "eligibility_evaluation_logs" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "eligibility_evaluation_logs_target_idx" ON "eligibility_evaluation_logs" USING btree ("target_type" text_ops,"target_code" text_ops);--> statement-breakpoint
CREATE INDEX "eligibility_evaluation_logs_evaluated_at_idx" ON "eligibility_evaluation_logs" USING btree ("evaluated_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "service_conditions_service_code_idx" ON "service_conditions" USING btree ("service_code" text_ops);--> statement-breakpoint
CREATE INDEX "service_conditions_type_idx" ON "service_conditions" USING btree ("condition_type" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "service_conditions_service_code_condition_key_key" ON "service_conditions" USING btree ("service_code" text_ops,"condition_key" text_ops);