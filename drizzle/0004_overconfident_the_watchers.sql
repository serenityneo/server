CREATE TYPE "public"."RequestSource" AS ENUM('UI', 'SERVER');--> statement-breakpoint
ALTER TYPE "public"."KycLockStep" ADD VALUE 'AGENCY_ASSIGNED';--> statement-breakpoint
CREATE TABLE "exchange_rate_audit" (
	"id" serial PRIMARY KEY NOT NULL,
	"old_rate" double precision,
	"new_rate" double precision NOT NULL,
	"changed_by" integer NOT NULL,
	"changed_by_email" text,
	"changed_by_role" text,
	"change_reason" text,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"method" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"status_code" integer,
	"customer_id" integer,
	"action_type" text,
	"source" "RequestSource" DEFAULT 'SERVER' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"request_body" jsonb,
	"response_size" integer,
	"error_message" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"date" timestamp DEFAULT CURRENT_DATE NOT NULL
);
--> statement-breakpoint
ALTER TABLE "request_logs" ADD CONSTRAINT "request_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "exchange_rate_audit_changed_by_idx" ON "exchange_rate_audit" USING btree ("changed_by" int4_ops);--> statement-breakpoint
CREATE INDEX "exchange_rate_audit_created_at_idx" ON "exchange_rate_audit" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "request_logs_endpoint_idx" ON "request_logs" USING btree ("endpoint" text_ops);--> statement-breakpoint
CREATE INDEX "request_logs_duration_idx" ON "request_logs" USING btree ("duration_ms" int4_ops);--> statement-breakpoint
CREATE INDEX "request_logs_customer_id_idx" ON "request_logs" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "request_logs_date_idx" ON "request_logs" USING btree ("date" date_ops);--> statement-breakpoint
CREATE INDEX "request_logs_created_at_idx" ON "request_logs" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "request_logs_source_idx" ON "request_logs" USING btree ("source" text_ops);