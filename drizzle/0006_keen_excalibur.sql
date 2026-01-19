CREATE TYPE "public"."ModificationChangeType" AS ENUM('BALANCE_UPDATE', 'INFO_UPDATE', 'STATUS_CHANGE', 'ACCOUNT_CREATION');--> statement-breakpoint
CREATE TYPE "public"."ModificationStatus" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "pending_customer_changes" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"change_type" "ModificationChangeType" NOT NULL,
	"requested_changes" jsonb NOT NULL,
	"original_values" jsonb,
	"reason" text NOT NULL,
	"requested_by_admin_id" integer NOT NULL,
	"requested_by_role" text NOT NULL,
	"requested_by_name" text NOT NULL,
	"requested_by_ip" text NOT NULL,
	"requested_by_user_agent" text,
	"requested_by_device_fingerprint" text,
	"approved_by_admin_id" integer,
	"approved_by_role" text,
	"approved_by_name" text,
	"approved_at" timestamp(3),
	"status" "ModificationStatus" DEFAULT 'PENDING' NOT NULL,
	"rejection_reason" text,
	"expires_at" timestamp(3) NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "validated_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "rejected_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_modified_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "rejection_notes" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "admin_notes" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "kyc_audit_trail" jsonb;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "created_by_admin_id" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "created_by_admin_role" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "created_by_admin_ip" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "created_by_admin_name" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "created_by_user_agent" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "created_by_session_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "created_by_device_fingerprint" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_modified_by_admin_id" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_modified_by_admin_ip" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "last_modified_by_user_agent" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "modification_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "is_manual_creation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_customer_changes" ADD CONSTRAINT "pending_changes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "pending_customer_changes" ADD CONSTRAINT "pending_changes_requested_by_admin_id_fkey" FOREIGN KEY ("requested_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "pending_customer_changes" ADD CONSTRAINT "pending_changes_approved_by_admin_id_fkey" FOREIGN KEY ("approved_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "pending_changes_customer_id_idx" ON "pending_customer_changes" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "pending_changes_status_idx" ON "pending_customer_changes" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "pending_changes_expires_at_idx" ON "pending_customer_changes" USING btree ("expires_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "pending_changes_requested_by_idx" ON "pending_customer_changes" USING btree ("requested_by_admin_id" int4_ops);--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_validated_by_user_id_fkey" FOREIGN KEY ("validated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_rejected_by_user_id_fkey" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_last_modified_by_user_id_fkey" FOREIGN KEY ("last_modified_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_last_modified_by_admin_id_fkey" FOREIGN KEY ("last_modified_by_admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;