CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(5) NOT NULL,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"agency_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_configurations" (
	"id" serial PRIMARY KEY NOT NULL,
	"operation_type" text NOT NULL,
	"commission_amount_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"commission_amount_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"commission_percentage" numeric(5, 2),
	"valid_from" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"valid_until" timestamp(3),
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"conditions" jsonb,
	"created_by" integer NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"configuration_id" integer,
	"notification_type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mobile_app_installs" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"referral_code" text NOT NULL,
	"device_info" jsonb,
	"install_date" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_by" integer,
	"verified_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"agency_id" integer,
	"approved_by" integer,
	"approval_date" timestamp(3),
	"rejection_reason" text,
	"notes" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_commissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"operation_id" integer NOT NULL,
	"configuration_id" integer NOT NULL,
	"amount_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"amount_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"calculation_basis" jsonb,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"paid_at" timestamp(3),
	"payment_reference" text,
	"notes" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_operations" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"operation_type" text NOT NULL,
	"target_customer_id" integer,
	"amount" numeric(15, 2),
	"currency" "Currency" DEFAULT 'CDF',
	"description" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"points_awarded" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"approved_by" integer,
	"approval_date" timestamp(3),
	"completed_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_points" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"points" integer NOT NULL,
	"operation_type" text NOT NULL,
	"operation_id" integer,
	"description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor_error_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"user_email" text,
	"user_phone" text,
	"error_type" text NOT NULL,
	"error_message" text,
	"user_description" text,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"authenticator_app" text,
	"device_info" jsonb,
	"ip_address" text,
	"user_agent" text,
	"screenshot_url" text,
	"screenshot_data" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"assigned_to" integer,
	"admin_notes" text,
	"resolved_at" timestamp(3),
	"resolution" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
DROP INDEX "account_types_code_key";--> statement-breakpoint
ALTER TABLE "account_types" ADD COLUMN "currency" "Currency" NOT NULL;--> statement-breakpoint
ALTER TABLE "agencies" ADD COLUMN "code" varchar(2) NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "cif" varchar(8);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "agent_id" integer;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "account_number" varchar(8);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "first_deposit_date" timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "first_deposit_amount" numeric(15, 2);--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "first_deposit_commission_awarded" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_secret" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_backup_codes" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_configured_at" timestamp(3);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_failed_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_last_failed_at" timestamp(3);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "mfa_failure_log" jsonb;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "commission_configurations" ADD CONSTRAINT "commission_configurations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "commission_notifications" ADD CONSTRAINT "commission_notifications_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "commission_notifications" ADD CONSTRAINT "commission_notifications_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "public"."commission_configurations"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mobile_app_installs" ADD CONSTRAINT "mobile_app_installs_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mobile_app_installs" ADD CONSTRAINT "mobile_app_installs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "mobile_app_installs" ADD CONSTRAINT "mobile_app_installs_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_approvals" ADD CONSTRAINT "partner_approvals_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_approvals" ADD CONSTRAINT "partner_approvals_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_approvals" ADD CONSTRAINT "partner_approvals_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "public"."partner_operations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_commissions" ADD CONSTRAINT "partner_commissions_configuration_id_fkey" FOREIGN KEY ("configuration_id") REFERENCES "public"."commission_configurations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_operations" ADD CONSTRAINT "partner_operations_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_operations" ADD CONSTRAINT "partner_operations_target_customer_id_fkey" FOREIGN KEY ("target_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_operations" ADD CONSTRAINT "partner_operations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_points" ADD CONSTRAINT "partner_points_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "two_factor_error_reports" ADD CONSTRAINT "two_factor_error_reports_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "two_factor_error_reports" ADD CONSTRAINT "two_factor_error_reports_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "agents_code_key" ON "agents" USING btree ("code" text_ops);--> statement-breakpoint
CREATE INDEX "agents_agency_id_idx" ON "agents" USING btree ("agency_id" int4_ops);--> statement-breakpoint
CREATE INDEX "agents_type_idx" ON "agents" USING btree ("type" text_ops);--> statement-breakpoint
CREATE INDEX "commission_configurations_operation_type_idx" ON "commission_configurations" USING btree ("operation_type" text_ops);--> statement-breakpoint
CREATE INDEX "commission_configurations_valid_from_idx" ON "commission_configurations" USING btree ("valid_from" timestamp_ops);--> statement-breakpoint
CREATE INDEX "commission_configurations_is_active_idx" ON "commission_configurations" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "commission_notifications_partner_id_idx" ON "commission_notifications" USING btree ("partner_id" int4_ops);--> statement-breakpoint
CREATE INDEX "commission_notifications_is_read_idx" ON "commission_notifications" USING btree ("is_read" bool_ops);--> statement-breakpoint
CREATE INDEX "commission_notifications_created_at_idx" ON "commission_notifications" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "mobile_app_installs_customer_id_key" ON "mobile_app_installs" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "mobile_app_installs_partner_id_idx" ON "mobile_app_installs" USING btree ("partner_id" int4_ops);--> statement-breakpoint
CREATE INDEX "mobile_app_installs_referral_code_idx" ON "mobile_app_installs" USING btree ("referral_code" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "partner_approvals_partner_id_key" ON "partner_approvals" USING btree ("partner_id" int4_ops);--> statement-breakpoint
CREATE INDEX "partner_approvals_status_idx" ON "partner_approvals" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "partner_commissions_partner_id_idx" ON "partner_commissions" USING btree ("partner_id" int4_ops);--> statement-breakpoint
CREATE INDEX "partner_commissions_operation_id_idx" ON "partner_commissions" USING btree ("operation_id" int4_ops);--> statement-breakpoint
CREATE INDEX "partner_commissions_status_idx" ON "partner_commissions" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "partner_commissions_created_at_idx" ON "partner_commissions" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "partner_operations_partner_id_idx" ON "partner_operations" USING btree ("partner_id" int4_ops);--> statement-breakpoint
CREATE INDEX "partner_operations_target_customer_id_idx" ON "partner_operations" USING btree ("target_customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "partner_operations_operation_type_idx" ON "partner_operations" USING btree ("operation_type" text_ops);--> statement-breakpoint
CREATE INDEX "partner_operations_status_idx" ON "partner_operations" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "partner_operations_created_at_idx" ON "partner_operations" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "partner_points_partner_id_idx" ON "partner_points" USING btree ("partner_id" int4_ops);--> statement-breakpoint
CREATE INDEX "partner_points_operation_type_idx" ON "partner_points" USING btree ("operation_type" text_ops);--> statement-breakpoint
CREATE INDEX "partner_points_created_at_idx" ON "partner_points" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "two_factor_error_reports_customer_id_idx" ON "two_factor_error_reports" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "two_factor_error_reports_status_idx" ON "two_factor_error_reports" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "two_factor_error_reports_created_at_idx" ON "two_factor_error_reports" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "account_types_code_currency_key" ON "account_types" USING btree ("code" text_ops,"currency" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "agencies_code_key" ON "agencies" USING btree ("code" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "customers_cif_key" ON "customers" USING btree ("cif" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "customers_agency_account_number_key" ON "customers" USING btree ("agency_id" int4_ops,"account_number" text_ops);--> statement-breakpoint
CREATE INDEX "customers_agent_id_idx" ON "customers" USING btree ("agent_id" int4_ops);