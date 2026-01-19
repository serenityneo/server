CREATE TABLE "system_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"path" text,
	"method" text,
	"user_id" integer,
	"severity" text DEFAULT 'CRITICAL' NOT NULL,
	"metadata" jsonb,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DROP INDEX "pending_changes_status_idx";--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "manager_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "agency_id" integer;--> statement-breakpoint
ALTER TABLE "system_errors" ADD CONSTRAINT "system_errors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "system_errors_created_at_idx" ON "system_errors" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "system_errors_severity_idx" ON "system_errors" USING btree ("severity" text_ops);--> statement-breakpoint
CREATE INDEX "agencies_manager_id_idx" ON "agencies" USING btree ("manager_id" int4_ops);--> statement-breakpoint
CREATE INDEX "customers_created_at_idx" ON "customers" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "customers_status_idx" ON "customers" USING btree ("status" enum_ops);--> statement-breakpoint
CREATE INDEX "customers_kyc_status_idx" ON "customers" USING btree ("kyc_status" enum_ops);--> statement-breakpoint
CREATE INDEX "customers_mfa_enabled_idx" ON "customers" USING btree ("mfa_enabled" bool_ops);--> statement-breakpoint
CREATE INDEX "pending_changes_change_type_idx" ON "pending_customer_changes" USING btree ("change_type" enum_ops);--> statement-breakpoint
CREATE INDEX "users_agency_id_idx" ON "users" USING btree ("agency_id" int4_ops);--> statement-breakpoint
CREATE INDEX "users_is_active_idx" ON "users" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "users_mfa_enabled_idx" ON "users" USING btree ("mfa_enabled" bool_ops);--> statement-breakpoint
CREATE INDEX "pending_changes_status_idx" ON "pending_customer_changes" USING btree ("status" enum_ops);