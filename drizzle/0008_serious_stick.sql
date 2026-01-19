CREATE TYPE "public"."credit_lifecycle_status" AS ENUM('ELIGIBILITY_CHECK', 'DOCUMENTS_PENDING', 'DOCUMENTS_SUBMITTED', 'ADMIN_REVIEW', 'CAUTION_PENDING', 'APPROVED', 'DISBURSED', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'VIRTUAL_PRISON', 'LEGAL_PURSUIT', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."credit_product_type" AS ENUM('BOMBE', 'TELEMA', 'MOPAO', 'VIMBISA', 'LIKELEMBA');--> statement-breakpoint
CREATE TYPE "public"."repayment_status" AS ENUM('ON_TIME', 'LATE', 'PARTIALLY_PAID', 'MISSED', 'RECOVERED');--> statement-breakpoint
CREATE TYPE "public"."distribution_method" AS ENUM('LOTTERY', 'BIDDING', 'ROTATION', 'NEED_BASED');--> statement-breakpoint
CREATE TYPE "public"."group_status" AS ENUM('PENDING_APPROVAL', 'APPROVED', 'PENDING_MEMBERS', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."member_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'EXITED');--> statement-breakpoint
CREATE TYPE "public"."CardPaymentMethod" AS ENUM('MOBILE_MONEY', 'S01_ACCOUNT');--> statement-breakpoint
CREATE TYPE "public"."CardRequestStatus" AS ENUM('PENDING', 'PAYMENT_PENDING', 'PAID', 'PROCESSING', 'READY', 'DELIVERED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."MobileMoneyProvider" AS ENUM('MPESA', 'AIRTEL_MONEY', 'ORANGE_MONEY', 'AFRIMONEY');--> statement-breakpoint
CREATE TABLE "bombe_renewal_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"previous_credit_id" integer,
	"new_credit_id" integer NOT NULL,
	"amount_usd" numeric(10, 2) NOT NULL,
	"renewal_date" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"auto_renewed" boolean DEFAULT true,
	"renewal_blocked" boolean DEFAULT false,
	"blocked_reason" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"product_type" "credit_product_type" NOT NULL,
	"requested_amount_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"requested_amount_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"approved_amount_cdf" numeric(15, 2),
	"approved_amount_usd" numeric(15, 2),
	"disbursed_amount_cdf" numeric(15, 2),
	"disbursed_amount_usd" numeric(15, 2),
	"processing_fee_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"processing_fee_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"interest_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"total_interest_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_interest_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"duration_months" integer,
	"duration_days" integer,
	"s02_account_id" integer,
	"s03_caution_account_id" integer,
	"s04_credit_account_id" integer,
	"caution_percentage" numeric(5, 2) DEFAULT '30.00' NOT NULL,
	"caution_amount_cdf" numeric(15, 2),
	"caution_amount_usd" numeric(15, 2),
	"caution_deposited" boolean DEFAULT false,
	"business_documents" jsonb,
	"documents_validated" boolean DEFAULT false,
	"documents_validator_id" integer,
	"documents_validation_date" timestamp(3),
	"status" "credit_lifecycle_status" DEFAULT 'ELIGIBILITY_CHECK' NOT NULL,
	"eligibility_check_passed" boolean DEFAULT false,
	"eligibility_reasons" text[],
	"monthly_payment_cdf" numeric(15, 2),
	"monthly_payment_usd" numeric(15, 2),
	"daily_payment_cdf" numeric(15, 2),
	"daily_payment_usd" numeric(15, 2),
	"total_paid_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_paid_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"remaining_balance_cdf" numeric(15, 2),
	"remaining_balance_usd" numeric(15, 2),
	"late_interest_rate" numeric(5, 2) DEFAULT '5.00',
	"total_late_interest_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_late_interest_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"penalty_amount_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"penalty_amount_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"application_date" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"approval_date" timestamp(3),
	"disbursement_date" timestamp(3),
	"maturity_date" timestamp(3),
	"completion_date" timestamp(3),
	"default_date" timestamp(3),
	"is_auto_renewable" boolean DEFAULT false,
	"renewal_count" integer DEFAULT 0,
	"last_renewal_date" timestamp(3),
	"next_renewal_date" timestamp(3),
	"sponsor_customer_id" integer,
	"sponsored_customers" integer[],
	"sponsor_guarantee_percentage" numeric(5, 2) DEFAULT '40.00',
	"approved_by" integer,
	"notes" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"credit_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"notification_type" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"message" text NOT NULL,
	"sent_via_sms" boolean DEFAULT false,
	"sent_via_email" boolean DEFAULT false,
	"sent_via_push" boolean DEFAULT false,
	"is_sent" boolean DEFAULT false,
	"is_read" boolean DEFAULT false,
	"sent_at" timestamp(3),
	"read_at" timestamp(3),
	"scheduled_for" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_virtual_prison" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"credit_id" integer NOT NULL,
	"blocked_reason" varchar(100) NOT NULL,
	"outstanding_principal_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"outstanding_principal_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"outstanding_interest_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"outstanding_interest_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"penalty_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"penalty_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"blocked_since" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"released_at" timestamp(3),
	"is_active" boolean DEFAULT true,
	"days_blocked" integer DEFAULT 0,
	"release_conditions" text,
	"amount_paid_to_release_cdf" numeric(15, 2),
	"amount_paid_to_release_usd" numeric(15, 2),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mopao_sponsorships" (
	"id" serial PRIMARY KEY NOT NULL,
	"sponsor_customer_id" integer NOT NULL,
	"sponsored_customer_id" integer NOT NULL,
	"credit_id" integer NOT NULL,
	"sponsor_guarantee_percentage" numeric(5, 2) DEFAULT '40.00' NOT NULL,
	"sponsor_guarantee_amount_cdf" numeric(15, 2) NOT NULL,
	"sponsor_guarantee_amount_usd" numeric(15, 2) NOT NULL,
	"sponsor_s02_locked_amount_cdf" numeric(15, 2),
	"sponsor_s02_locked_amount_usd" numeric(15, 2),
	"is_active" boolean DEFAULT true,
	"sponsor_liability_triggered" boolean DEFAULT false,
	"sponsor_paid_cdf" numeric(15, 2) DEFAULT '0',
	"sponsor_paid_usd" numeric(15, 2) DEFAULT '0',
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"released_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "s02_deposit_tracking" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"s02_account_id" integer NOT NULL,
	"deposit_date" timestamp NOT NULL,
	"amount_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"amount_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"is_consecutive" boolean DEFAULT true,
	"consecutive_days_count" integer DEFAULT 1,
	"consecutive_weeks_count" integer DEFAULT 1,
	"transaction_id" integer,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likelemba_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"creator_id" integer NOT NULL,
	"group_name" varchar(200) NOT NULL,
	"group_description" text,
	"monthly_contribution_usd" numeric(15, 2) NOT NULL,
	"monthly_contribution_cdf" numeric(15, 2) DEFAULT '0',
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"total_members" integer NOT NULL,
	"current_members" integer DEFAULT 1,
	"min_members" integer DEFAULT 3,
	"max_members" integer DEFAULT 50,
	"duration_months" integer DEFAULT 12 NOT NULL,
	"current_round" integer DEFAULT 1,
	"total_rounds" integer,
	"total_fund_per_round" numeric(15, 2) NOT NULL,
	"interest_rate" numeric(5, 2) DEFAULT '0.50',
	"total_interest_per_round" numeric(15, 2),
	"distributionMethod" "distribution_method" DEFAULT 'LOTTERY',
	"status" "group_status" DEFAULT 'PENDING_APPROVAL',
	"is_active" boolean DEFAULT false,
	"approved_by" integer,
	"approved_at" timestamp(3),
	"rejected_by" integer,
	"rejected_at" timestamp(3),
	"rejection_reason" text,
	"start_date" timestamp(3),
	"end_date" timestamp(3),
	"next_distribution_date" timestamp(3),
	"late_payment_penalty_rate" numeric(5, 2) DEFAULT '2.00',
	"max_missed_payments" integer DEFAULT 2,
	"allow_early_exit" boolean DEFAULT false,
	"exit_penalty_percentage" numeric(5, 2) DEFAULT '10.00',
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likelemba_contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"round_number" integer NOT NULL,
	"contribution_month" timestamp NOT NULL,
	"due_date" timestamp NOT NULL,
	"expected_amount_usd" numeric(15, 2) NOT NULL,
	"expected_amount_cdf" numeric(15, 2) DEFAULT '0',
	"paid_amount_usd" numeric(15, 2) DEFAULT '0',
	"paid_amount_cdf" numeric(15, 2) DEFAULT '0',
	"penalty_amount_usd" numeric(15, 2) DEFAULT '0',
	"penalty_amount_cdf" numeric(15, 2) DEFAULT '0',
	"days_late" integer DEFAULT 0,
	"is_paid" boolean DEFAULT false,
	"is_late" boolean DEFAULT false,
	"paid_at" timestamp(3),
	"transaction_id" integer,
	"payment_method" varchar(50),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likelemba_distributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"round_number" integer NOT NULL,
	"winner_id" integer NOT NULL,
	"winner_customer_id" integer NOT NULL,
	"distributed_amount_usd" numeric(15, 2) NOT NULL,
	"distributed_amount_cdf" numeric(15, 2) DEFAULT '0',
	"interest_amount_usd" numeric(15, 2) DEFAULT '0',
	"interest_amount_cdf" numeric(15, 2) DEFAULT '0',
	"total_distributed_usd" numeric(15, 2) NOT NULL,
	"total_distributed_cdf" numeric(15, 2) DEFAULT '0',
	"distributionMethod" "distribution_method" NOT NULL,
	"lottery_details" jsonb,
	"bidding_details" jsonb,
	"is_completed" boolean DEFAULT false,
	"is_paid" boolean DEFAULT false,
	"distribution_date" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"paid_at" timestamp(3),
	"transaction_id" integer,
	"notes" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likelemba_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"invited_customer_id" integer,
	"invited_name" varchar(200),
	"invited_email" varchar(200),
	"invited_phone" varchar(50),
	"invited_by" integer NOT NULL,
	"status" "invitation_status" DEFAULT 'PENDING',
	"invitation_token" varchar(100),
	"expires_at" timestamp(3),
	"responded_at" timestamp(3),
	"rejection_reason" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "likelemba_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"status" "member_status" DEFAULT 'PENDING',
	"is_creator" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"joined_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"exited_at" timestamp(3),
	"draw_position" integer,
	"has_received_fund" boolean DEFAULT false,
	"received_fund_round" integer,
	"received_fund_date" timestamp(3),
	"received_amount_usd" numeric(15, 2),
	"received_amount_cdf" numeric(15, 2),
	"total_contributions_usd" numeric(15, 2) DEFAULT '0',
	"total_contributions_cdf" numeric(15, 2) DEFAULT '0',
	"total_penalties_usd" numeric(15, 2) DEFAULT '0',
	"total_penalties_cdf" numeric(15, 2) DEFAULT '0',
	"missed_payments_count" integer DEFAULT 0,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "card_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"card_request_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"payment_method" "CardPaymentMethod" NOT NULL,
	"mobile_money_provider" "MobileMoneyProvider",
	"amount_usd" numeric(10, 2) NOT NULL,
	"amount_cdf" numeric(15, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'USD',
	"transaction_reference" varchar(100),
	"external_reference" varchar(100),
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"s01_account_id" integer,
	"s01_transaction_id" integer,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"completed_at" timestamp(3),
	"failed_at" timestamp(3),
	"failure_reason" text
);
--> statement-breakpoint
CREATE TABLE "card_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"card_type_id" integer NOT NULL,
	"request_number" varchar(30) NOT NULL,
	"payment_method" "CardPaymentMethod" NOT NULL,
	"mobile_money_provider" "MobileMoneyProvider",
	"mobile_money_number" varchar(20),
	"payment_reference" varchar(100),
	"amount_usd" numeric(10, 2) NOT NULL,
	"amount_cdf" numeric(15, 2) NOT NULL,
	"currency_paid" varchar(3) DEFAULT 'USD',
	"card_number" varchar(20),
	"card_expiry_date" varchar(7),
	"status" "CardRequestStatus" DEFAULT 'PENDING' NOT NULL,
	"reviewed_by_id" integer,
	"review_note" text,
	"rejection_reason" text,
	"requested_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"paid_at" timestamp(3),
	"approved_at" timestamp(3),
	"ready_at" timestamp(3),
	"delivered_at" timestamp(3),
	"rejected_at" timestamp(3),
	"cancelled_at" timestamp(3),
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "card_requests_request_number_unique" UNIQUE("request_number")
);
--> statement-breakpoint
CREATE TABLE "card_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"price_usd" numeric(10, 2) NOT NULL,
	"price_cdf" numeric(15, 2) NOT NULL,
	"image_url" text,
	"card_color" varchar(20) DEFAULT '#5C4033',
	"features" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "card_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "credit_repayments" DROP CONSTRAINT "credit_repayments_credit_request_id_fkey";
--> statement-breakpoint
ALTER TABLE "credit_repayments" DROP CONSTRAINT "credit_repayments_customer_id_fkey";
--> statement-breakpoint
DROP INDEX "credit_repayments_credit_request_id_idx";--> statement-breakpoint
DROP INDEX "credit_repayments_customer_id_idx";--> statement-breakpoint
ALTER TABLE "credit_repayments" ALTER COLUMN "currency" SET DATA TYPE varchar(3);--> statement-breakpoint
ALTER TABLE "credit_repayments" ALTER COLUMN "currency" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "credit_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "amount_cdf" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "amount_usd" numeric(15, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "payment_type" varchar(20) NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "is_on_time" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "due_date" timestamp;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "payment_date" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "days_late" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "status" "repayment_status" DEFAULT 'ON_TIME' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "paid_from_account_id" integer;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "auto_debited_from_s02" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "auto_debited_from_s03" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD COLUMN "reference_number" varchar(100);--> statement-breakpoint
ALTER TABLE "bombe_renewal_history" ADD CONSTRAINT "fk_renewal_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "fk_credit_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_notifications" ADD CONSTRAINT "fk_notification_credit" FOREIGN KEY ("credit_id") REFERENCES "public"."credit_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_virtual_prison" ADD CONSTRAINT "fk_prison_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mopao_sponsorships" ADD CONSTRAINT "fk_sponsorship_sponsor" FOREIGN KEY ("sponsor_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "s02_deposit_tracking" ADD CONSTRAINT "fk_s02_tracking_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likelemba_groups" ADD CONSTRAINT "fk_group_creator" FOREIGN KEY ("creator_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likelemba_contributions" ADD CONSTRAINT "fk_contribution_group" FOREIGN KEY ("group_id") REFERENCES "public"."likelemba_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likelemba_contributions" ADD CONSTRAINT "fk_contribution_member" FOREIGN KEY ("member_id") REFERENCES "public"."likelemba_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likelemba_distributions" ADD CONSTRAINT "fk_distribution_group" FOREIGN KEY ("group_id") REFERENCES "public"."likelemba_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likelemba_distributions" ADD CONSTRAINT "fk_distribution_winner" FOREIGN KEY ("winner_id") REFERENCES "public"."likelemba_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likelemba_invitations" ADD CONSTRAINT "fk_invitation_group" FOREIGN KEY ("group_id") REFERENCES "public"."likelemba_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likelemba_invitations" ADD CONSTRAINT "fk_invitation_inviter" FOREIGN KEY ("invited_by") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likelemba_members" ADD CONSTRAINT "fk_member_group" FOREIGN KEY ("group_id") REFERENCES "public"."likelemba_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "likelemba_members" ADD CONSTRAINT "fk_member_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_payments" ADD CONSTRAINT "card_payments_card_request_id_fkey" FOREIGN KEY ("card_request_id") REFERENCES "public"."card_requests"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "card_payments" ADD CONSTRAINT "card_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "card_requests" ADD CONSTRAINT "card_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "idx_renewal_customer" ON "bombe_renewal_history" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_renewal_date" ON "bombe_renewal_history" USING btree ("renewal_date" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_applications_customer" ON "credit_applications" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_applications_product" ON "credit_applications" USING btree ("product_type" text_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_applications_status" ON "credit_applications" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_credit_applications_disbursement" ON "credit_applications" USING btree ("disbursement_date" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_credit" ON "credit_notifications" USING btree ("credit_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_customer" ON "credit_notifications" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_notifications_scheduled" ON "credit_notifications" USING btree ("scheduled_for" timestamp_ops);--> statement-breakpoint
CREATE INDEX "idx_prison_customer" ON "credit_virtual_prison" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_prison_active" ON "credit_virtual_prison" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_sponsorships_sponsor" ON "mopao_sponsorships" USING btree ("sponsor_customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_sponsorships_sponsored" ON "mopao_sponsorships" USING btree ("sponsored_customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_s02_tracking_customer" ON "s02_deposit_tracking" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_s02_tracking_date" ON "s02_deposit_tracking" USING btree ("deposit_date" date_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "unique_customer_deposit_date" ON "s02_deposit_tracking" USING btree ("customer_id" int4_ops,"deposit_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_groups_creator" ON "likelemba_groups" USING btree ("creator_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_groups_status" ON "likelemba_groups" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_groups_active" ON "likelemba_groups" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "idx_contributions_group" ON "likelemba_contributions" USING btree ("group_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_contributions_member" ON "likelemba_contributions" USING btree ("member_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_contributions_round" ON "likelemba_contributions" USING btree ("round_number" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_contributions_due_date" ON "likelemba_contributions" USING btree ("due_date" date_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "unique_member_round" ON "likelemba_contributions" USING btree ("member_id" int4_ops,"round_number" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_distributions_group" ON "likelemba_distributions" USING btree ("group_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_distributions_round" ON "likelemba_distributions" USING btree ("round_number" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_distributions_winner" ON "likelemba_distributions" USING btree ("winner_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "unique_group_round" ON "likelemba_distributions" USING btree ("group_id" int4_ops,"round_number" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_invitations_group" ON "likelemba_invitations" USING btree ("group_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_invitations_customer" ON "likelemba_invitations" USING btree ("invited_customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_invitations_email" ON "likelemba_invitations" USING btree ("invited_email" text_ops);--> statement-breakpoint
CREATE INDEX "idx_members_group" ON "likelemba_members" USING btree ("group_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_members_customer" ON "likelemba_members" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "unique_group_customer" ON "likelemba_members" USING btree ("group_id" int4_ops,"customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "card_payments_card_request_id_idx" ON "card_payments" USING btree ("card_request_id" int4_ops);--> statement-breakpoint
CREATE INDEX "card_payments_customer_id_idx" ON "card_payments" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "card_payments_status_idx" ON "card_payments" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "card_payments_created_at_idx" ON "card_payments" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "card_requests_customer_id_idx" ON "card_requests" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "card_requests_card_type_id_idx" ON "card_requests" USING btree ("card_type_id" int4_ops);--> statement-breakpoint
CREATE INDEX "card_requests_status_idx" ON "card_requests" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "card_requests_requested_at_idx" ON "card_requests" USING btree ("requested_at" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "card_requests_request_number_key" ON "card_requests" USING btree ("request_number" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "card_types_code_key" ON "card_types" USING btree ("code" text_ops);--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD CONSTRAINT "fk_repayment_credit" FOREIGN KEY ("credit_id") REFERENCES "public"."credit_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_repayments_credit" ON "credit_repayments" USING btree ("credit_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_repayments_customer" ON "credit_repayments" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_repayments_due_date" ON "credit_repayments" USING btree ("due_date" date_ops);--> statement-breakpoint
ALTER TABLE "credit_repayments" DROP COLUMN "credit_request_id";--> statement-breakpoint
ALTER TABLE "credit_repayments" DROP COLUMN "allocation_id";--> statement-breakpoint
ALTER TABLE "credit_repayments" DROP COLUMN "amount";--> statement-breakpoint
ALTER TABLE "credit_repayments" DROP COLUMN "payment_method";--> statement-breakpoint
ALTER TABLE "credit_repayments" DROP COLUMN "source_account_id";--> statement-breakpoint
ALTER TABLE "credit_repayments" DROP COLUMN "repaid_at";--> statement-breakpoint
ALTER TABLE "credit_repayments" DROP COLUMN "processed_by";