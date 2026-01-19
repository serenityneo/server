CREATE TYPE "public"."AccountStatus" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."AccountType" AS ENUM('S01_STANDARD', 'S02_MANDATORY_SAVINGS', 'S03_CAUTION', 'S04_CREDIT', 'S05_BWAKISA_CARTE', 'S06_FINES');--> statement-breakpoint
CREATE TYPE "public"."CivilStatus" AS ENUM('SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED');--> statement-breakpoint
CREATE TYPE "public"."CreditStatus" AS ENUM('PENDING', 'APPROVED', 'DISBURSED', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."Currency" AS ENUM('CDF', 'USD');--> statement-breakpoint
CREATE TYPE "public"."CustomerCategory" AS ENUM('CATEGORY_1', 'CATEGORY_2', 'GOLD');--> statement-breakpoint
CREATE TYPE "public"."CustomerStatus" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."CustomerType" AS ENUM('MEMBER', 'PARTNER');--> statement-breakpoint
CREATE TYPE "public"."DeviceStatus" AS ENUM('TRUSTED', 'PENDING', 'SUSPICIOUS', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."DeviceType" AS ENUM('MOBILE', 'DESKTOP', 'TABLET', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."FraudType" AS ENUM('LOCATION_ANOMALY', 'DEVICE_ANOMALY', 'BEHAVIORAL_ANOMALY', 'VPN_PROXY_DETECTED', 'MULTIPLE_DEVICES', 'RAPID_TRANSACTIONS', 'SUSPICIOUS_PATTERN');--> statement-breakpoint
CREATE TYPE "public"."Gender" AS ENUM('M', 'F');--> statement-breakpoint
CREATE TYPE "public"."KycLockStep" AS ENUM('NONE', 'STEP1', 'STEP2', 'STEP3');--> statement-breakpoint
CREATE TYPE "public"."KYCStatus" AS ENUM('NOT_STARTED', 'KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."LoginStatus" AS ENUM('SUCCESS', 'FAILED_PASSWORD', 'FAILED_OTP', 'BLOCKED_SUSPICIOUS', 'BLOCKED_DEVICE', 'BLOCKED_LOCATION', 'FAILED_SECURITY_QUESTION');--> statement-breakpoint
CREATE TYPE "public"."PartnerActionType" AS ENUM('CREATE_CUSTOMER', 'UPDATE_CUSTOMER', 'DEPOSIT', 'WITHDRAWAL', 'CREDIT_APPLICATION', 'CREDIT_APPROVAL', 'ACCOUNT_SUSPENSION', 'DOCUMENT_UPLOAD', 'KYC_VALIDATION', 'TRANSACTION_REVERSAL');--> statement-breakpoint
CREATE TYPE "public"."PartnerLimitType" AS ENUM('DAILY_TRANSACTIONS', 'MONTHLY_TRANSACTIONS', 'SINGLE_TRANSACTION', 'CUSTOMER_CREATION', 'CREDIT_APPROVAL');--> statement-breakpoint
CREATE TYPE "public"."RepaymentFrequency" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');--> statement-breakpoint
CREATE TYPE "public"."RiskLevel" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."SecurityQuestionType" AS ENUM('PERSONAL', 'FAMILY', 'PREFERENCE', 'HISTORICAL');--> statement-breakpoint
CREATE TYPE "public"."SettingCategory" AS ENUM('SYSTEM', 'SECURITY', 'CREDIT', 'EXCHANGE_RATES', 'FEES', 'LIMITS', 'NOTIFICATIONS', 'BUSINESS_RULES');--> statement-breakpoint
CREATE TYPE "public"."SettingType" AS ENUM('STRING', 'INTEGER', 'FLOAT', 'BOOLEAN', 'JSON');--> statement-breakpoint
CREATE TYPE "public"."TransactionStatus" AS ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."TransactionType" AS ENUM('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'CREDIT_DISBURSEMENT', 'CREDIT_REPAYMENT', 'FEE', 'INTEREST');--> statement-breakpoint
CREATE TABLE "account_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(3) NOT NULL,
	"label" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"default_status" "AccountStatus" DEFAULT 'INACTIVE' NOT NULL,
	"allowed_currencies" "Currency"[] NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"table_name" text,
	"record_id" text,
	"old_values" jsonb,
	"new_values" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_change_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"old_contact" text NOT NULL,
	"new_contact" text NOT NULL,
	"contact_type" text NOT NULL,
	"purpose" text NOT NULL,
	"ip_address" text NOT NULL,
	"user_agent" text NOT NULL,
	"otp_id" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"customer_id" integer
);
--> statement-breakpoint
CREATE TABLE "credit_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"label" varchar(100) NOT NULL,
	"description" text NOT NULL,
	"status" "AccountStatus" DEFAULT 'ACTIVE' NOT NULL,
	"allowed_currencies" "Currency"[] NOT NULL,
	"repayment_frequency" varchar(20) NOT NULL,
	"config" jsonb,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_behavior_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"typical_login_hours" jsonb,
	"typical_locations" jsonb,
	"typical_devices" jsonb,
	"typical_session_duration" double precision,
	"typical_actions_per_session" double precision,
	"login_frequency" double precision,
	"risk_tolerance" double precision DEFAULT 0.5 NOT NULL,
	"behavioral_score" double precision DEFAULT 0.5 NOT NULL,
	"last_analysis_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_login_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"device_fingerprint_id" integer,
	"login_status" "LoginStatus" NOT NULL,
	"ip_address" text NOT NULL,
	"country_code" text,
	"city" text,
	"region" text,
	"isp" text,
	"is_vpn" boolean DEFAULT false NOT NULL,
	"is_proxy" boolean DEFAULT false NOT NULL,
	"device_info" jsonb,
	"browser_info" jsonb,
	"user_agent" text,
	"screen_resolution" text,
	"timezone" text,
	"language" text,
	"risk_score" double precision DEFAULT 0 NOT NULL,
	"fraud_indicators" jsonb,
	"failure_reason" text,
	"otp_attempts" integer DEFAULT 0 NOT NULL,
	"security_question_attempts" integer DEFAULT 0 NOT NULL,
	"session_duration" integer,
	"actions_count" integer DEFAULT 0 NOT NULL,
	"login_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"logout_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_security_questions" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"question_type" "SecurityQuestionType" NOT NULL,
	"question" text NOT NULL,
	"answer_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_fingerprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"fingerprint_hash" text NOT NULL,
	"device_type" "DeviceType" NOT NULL,
	"device_status" "DeviceStatus" DEFAULT 'PENDING' NOT NULL,
	"device_name" text,
	"operating_system" text,
	"browser" text,
	"browser_version" text,
	"screen_resolution" text,
	"timezone" text,
	"language" text,
	"canvas_fingerprint" text,
	"webgl_fingerprint" text,
	"audio_fingerprint" text,
	"fonts_list" jsonb,
	"plugins_list" jsonb,
	"hardware_info" jsonb,
	"network_info" jsonb,
	"risk_score" double precision DEFAULT 0 NOT NULL,
	"trust_score" double precision DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"first_seen_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fraud_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"device_fingerprint_id" integer,
	"fraud_type" "FraudType" NOT NULL,
	"risk_level" "RiskLevel" NOT NULL,
	"confidence_score" double precision NOT NULL,
	"description" text NOT NULL,
	"indicators" jsonb NOT NULL,
	"ip_address" text,
	"country_code" text,
	"device_info" jsonb,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"resolved_by" integer,
	"resolution_notes" text,
	"resolved_at" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"kyc_step" text NOT NULL,
	"draft_data" jsonb NOT NULL,
	"global_doc_hashes" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"is_auto_saved" boolean DEFAULT true NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"device_info" jsonb,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"expires_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "otp" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"contact" text NOT NULL,
	"contact_type" text NOT NULL,
	"otp_code" text NOT NULL,
	"purpose" text NOT NULL,
	"expires_at" timestamp(3) NOT NULL,
	"current_attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"send_channel" text,
	"message_id" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_events" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"otp_id" text,
	"customer_id" integer,
	"contact" text NOT NULL,
	"contact_type" text NOT NULL,
	"purpose" text NOT NULL,
	"action" text NOT NULL,
	"channel" text,
	"ip_address" text,
	"user_agent" text,
	"message" text
);
--> statement-breakpoint
CREATE TABLE "partner_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"target_customer_id" integer,
	"action_type" "PartnerActionType" NOT NULL,
	"action_description" text NOT NULL,
	"amount" numeric(15, 2),
	"ip_address" text,
	"device_info" jsonb,
	"location_data" jsonb,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"approved_by" integer,
	"approval_date" timestamp(3),
	"is_suspicious" boolean DEFAULT false NOT NULL,
	"risk_score" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_security_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"limit_type" "PartnerLimitType" NOT NULL,
	"daily_limit" numeric(15, 2),
	"monthly_limit" numeric(15, 2),
	"transaction_limit" numeric(15, 2),
	"operation_count_limit" integer,
	"current_daily_usage" numeric(15, 2) DEFAULT '0' NOT NULL,
	"current_monthly_usage" numeric(15, 2) DEFAULT '0' NOT NULL,
	"current_operation_count" integer DEFAULT 0 NOT NULL,
	"last_reset_date" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_supervisor_relations" (
	"id" serial PRIMARY KEY NOT NULL,
	"partner_id" integer NOT NULL,
	"supervisor_id" integer NOT NULL,
	"assigned_date" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"territory" text,
	"notes" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "_prisma_migrations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"finished_at" timestamp with time zone,
	"migration_name" varchar(255) NOT NULL,
	"logs" text,
	"rolled_back_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_steps_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer,
	"event_type" text NOT NULL,
	"severity" "RiskLevel" NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "serenity_points_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"points" integer NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"category" text NOT NULL,
	"value" text NOT NULL,
	"data_type" text DEFAULT 'STRING' NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_encrypted" boolean DEFAULT false NOT NULL,
	"default_value" text,
	"validation_rules" jsonb,
	"last_modified_by" integer,
	"history" jsonb,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token" text NOT NULL,
	"device_info" jsonb,
	"ip_address" text,
	"expires_at" timestamp(3) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"browser_info" jsonb,
	"city" text,
	"country_code" text,
	"device_fingerprint_id" integer,
	"is_proxy" boolean DEFAULT false NOT NULL,
	"is_vpn" boolean DEFAULT false NOT NULL,
	"isp" text,
	"language" text,
	"last_activity_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"risk_score" double precision DEFAULT 0 NOT NULL,
	"screen_resolution" text,
	"timezone" text
);
--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_account_number_unique";--> statement-breakpoint
ALTER TABLE "agencies" DROP CONSTRAINT "agencies_name_unique";--> statement-breakpoint
ALTER TABLE "countries" DROP CONSTRAINT "countries_name_unique";--> statement-breakpoint
ALTER TABLE "countries" DROP CONSTRAINT "countries_code_unique";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_mobile_money_number_unique";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_email_unique";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_cif_code_unique";--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_public_id_unique";--> statement-breakpoint
ALTER TABLE "roles" DROP CONSTRAINT "roles_name_unique";--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_reference_number_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_username_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "agencies" DROP CONSTRAINT "agencies_commune_id_communes_id_fk";
--> statement-breakpoint
ALTER TABLE "cities" DROP CONSTRAINT "cities_country_id_countries_id_fk";
--> statement-breakpoint
ALTER TABLE "communes" DROP CONSTRAINT "communes_city_id_cities_id_fk";
--> statement-breakpoint
ALTER TABLE "credits" DROP CONSTRAINT "credits_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_quartier_id_quartiers_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_postal_code_id_postal_codes_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_created_by_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT "customers_agency_id_agencies_id_fk";
--> statement-breakpoint
ALTER TABLE "postal_codes" DROP CONSTRAINT "postal_codes_quartier_id_quartiers_id_fk";
--> statement-breakpoint
ALTER TABLE "quartiers" DROP CONSTRAINT "quartiers_commune_id_communes_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_account_id_accounts_id_fk";
--> statement-breakpoint
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_credit_id_credits_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_id_roles_id_fk";
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "account_type" SET DATA TYPE "public"."AccountType" USING "account_type"::text::"public"."AccountType";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "currency" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "currency" SET DATA TYPE "public"."Currency" USING "currency"::text::"public"."Currency";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "currency" SET DEFAULT 'CDF';--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "status" SET DATA TYPE "public"."AccountStatus" USING "status"::text::"public"."AccountStatus";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "opened_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "opened_date" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "closed_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "agencies" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "agencies" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "agencies" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "agencies" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "cities" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "communes" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "communes" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "communes" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "communes" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "countries" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "countries" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "countries" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "countries" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "credit_type" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "repayment_frequency" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "application_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "application_date" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "approval_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "disbursement_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "first_payment_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "last_payment_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "maturity_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "credit_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "credit_status" SET DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "product_config" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "eligibility_snapshot" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "repayment_schedule" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "credits" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "date_of_birth" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "id_card_expiry" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "passport_expiry" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "status" SET DATA TYPE "public"."CustomerStatus" USING "status"::text::"public"."CustomerStatus";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "kyc_status" SET DATA TYPE "public"."KYCStatus" USING "kyc_status"::text::"public"."KYCStatus";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "kyc_lock_step" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "kyc_lock_step" SET DATA TYPE "public"."KycLockStep" USING "kyc_lock_step"::text::"public"."KycLockStep";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "kyc_lock_step" SET DEFAULT 'NONE';--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "category" SET DATA TYPE "public"."CustomerCategory" USING "category"::text::"public"."CustomerCategory";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "customer_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "customer_type" SET DATA TYPE "public"."CustomerType" USING "customer_type"::text::"public"."CustomerType";--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "customer_type" SET DEFAULT 'MEMBER';--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "requires_dual_approval" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "partner_actions_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "last_action_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "suspicious_activity_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "kyc1_completion_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "kyc2_submission_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "kyc2_validation_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "gold_eligible_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "last_login" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "mfa_enabled" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "mfa_backup_codes" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "mfa_configured_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "account_creation_date" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "created_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "business_documents" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "postal_codes" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "postal_codes" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "postal_codes" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "postal_codes" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "quartiers" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "quartiers" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "quartiers" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "quartiers" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "roles" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "transaction_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "currency" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "currency" SET DATA TYPE "public"."Currency" USING "currency"::text::"public"."Currency";--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "currency" SET DEFAULT 'CDF';--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "status" SET DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "processed_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "otp_expires_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_login" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_logout" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "created_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DATA TYPE timestamp(3);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "contact_change_logs" ADD CONSTRAINT "contact_change_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_behavior_profiles" ADD CONSTRAINT "customer_behavior_profiles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_login_history" ADD CONSTRAINT "customer_login_history_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_login_history" ADD CONSTRAINT "customer_login_history_device_fingerprint_id_fkey" FOREIGN KEY ("device_fingerprint_id") REFERENCES "public"."device_fingerprints"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_security_questions" ADD CONSTRAINT "customer_security_questions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "device_fingerprints" ADD CONSTRAINT "device_fingerprints_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_device_fingerprint_id_fkey" FOREIGN KEY ("device_fingerprint_id") REFERENCES "public"."device_fingerprints"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "fraud_alerts" ADD CONSTRAINT "fraud_alerts_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "kyc_drafts" ADD CONSTRAINT "kyc_drafts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "otp" ADD CONSTRAINT "otp_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "otp_events" ADD CONSTRAINT "otp_events_otp_id_fkey" FOREIGN KEY ("otp_id") REFERENCES "public"."otp"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "otp_events" ADD CONSTRAINT "otp_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_actions" ADD CONSTRAINT "partner_actions_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_actions" ADD CONSTRAINT "partner_actions_target_customer_id_fkey" FOREIGN KEY ("target_customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_actions" ADD CONSTRAINT "partner_actions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_security_limits" ADD CONSTRAINT "partner_security_limits_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_supervisor_relations" ADD CONSTRAINT "partner_supervisor_relations_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "partner_supervisor_relations" ADD CONSTRAINT "partner_supervisor_relations_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "serenity_points_ledger" ADD CONSTRAINT "serenity_points_ledger_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_device_fingerprint_id_fkey" FOREIGN KEY ("device_fingerprint_id") REFERENCES "public"."device_fingerprints"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "account_types_code_key" ON "account_types" USING btree ("code" text_ops);--> statement-breakpoint
CREATE INDEX "contact_change_logs_created_at_idx" ON "contact_change_logs" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "contact_change_logs_customer_id_idx" ON "contact_change_logs" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "contact_change_logs_new_contact_idx" ON "contact_change_logs" USING btree ("new_contact" text_ops);--> statement-breakpoint
CREATE INDEX "contact_change_logs_old_contact_idx" ON "contact_change_logs" USING btree ("old_contact" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "credit_types_code_key" ON "credit_types" USING btree ("code" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "customer_behavior_profiles_customer_id_key" ON "customer_behavior_profiles" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "device_fingerprints_fingerprint_hash_key" ON "device_fingerprints" USING btree ("fingerprint_hash" text_ops);--> statement-breakpoint
CREATE INDEX "kyc_drafts_created_at_idx" ON "kyc_drafts" USING btree ("created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "kyc_drafts_customer_id_idx" ON "kyc_drafts" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_drafts_customer_id_kyc_step_key" ON "kyc_drafts" USING btree ("customer_id" int4_ops,"kyc_step" int4_ops);--> statement-breakpoint
CREATE INDEX "kyc_drafts_kyc_step_idx" ON "kyc_drafts" USING btree ("kyc_step" text_ops);--> statement-breakpoint
CREATE INDEX "kyc_drafts_updated_at_idx" ON "kyc_drafts" USING btree ("updated_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "otp_contact_contact_type_purpose_is_used_idx" ON "otp" USING btree ("contact" text_ops,"contact_type" text_ops,"purpose" bool_ops,"is_used" bool_ops);--> statement-breakpoint
CREATE INDEX "otp_events_contact_created_at_idx" ON "otp_events" USING btree ("contact" text_ops,"created_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "otp_events_customer_id_created_at_idx" ON "otp_events" USING btree ("customer_id" timestamp_ops,"created_at" int4_ops);--> statement-breakpoint
CREATE INDEX "otp_events_purpose_action_created_at_idx" ON "otp_events" USING btree ("purpose" timestamp_ops,"action" timestamp_ops,"created_at" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "partner_security_limits_partner_id_limit_type_key" ON "partner_security_limits" USING btree ("partner_id" int4_ops,"limit_type" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "partner_supervisor_relations_partner_id_supervisor_id_key" ON "partner_supervisor_relations" USING btree ("partner_id" int4_ops,"supervisor_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings" USING btree ("key" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_key" ON "user_sessions" USING btree ("token" text_ops);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "communes" ADD CONSTRAINT "communes_city_id_fkey" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_credit_type_fkey" FOREIGN KEY ("credit_type") REFERENCES "public"."credit_types"("code") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_managed_by_partner_id_fkey" FOREIGN KEY ("managed_by_partner_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_agency_id_fkey" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_quartier_id_fkey" FOREIGN KEY ("quartier_id") REFERENCES "public"."quartiers"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_postal_code_id_fkey" FOREIGN KEY ("postal_code_id") REFERENCES "public"."postal_codes"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "postal_codes" ADD CONSTRAINT "postal_codes_quartier_id_fkey" FOREIGN KEY ("quartier_id") REFERENCES "public"."quartiers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "quartiers" ADD CONSTRAINT "quartiers_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_account_number_key" ON "accounts" USING btree ("account_number" text_ops);--> statement-breakpoint
CREATE INDEX "agencies_commune_id_idx" ON "agencies" USING btree ("commune_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "agencies_name_key" ON "agencies" USING btree ("name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "cities_name_country_id_key" ON "cities" USING btree ("name" int4_ops,"country_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "communes_name_city_id_key" ON "communes" USING btree ("name" int4_ops,"city_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "countries_code_key" ON "countries" USING btree ("code" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "countries_name_key" ON "countries" USING btree ("name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "customers_cif_code_key" ON "customers" USING btree ("cif_code" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "customers_email_key" ON "customers" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "customers_mobile_money_number_key" ON "customers" USING btree ("mobile_money_number" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "customers_public_id_key" ON "customers" USING btree ("public_id" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "postal_codes_code_quartier_id_key" ON "postal_codes" USING btree ("code" int4_ops,"quartier_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "quartiers_name_commune_id_key" ON "quartiers" USING btree ("name" int4_ops,"commune_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "roles_name_key" ON "roles" USING btree ("name" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_reference_number_key" ON "transactions" USING btree ("reference_number" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_key" ON "users" USING btree ("username" text_ops);--> statement-breakpoint
DROP TYPE "public"."account_status";--> statement-breakpoint
DROP TYPE "public"."account_type";--> statement-breakpoint
DROP TYPE "public"."civil_status";--> statement-breakpoint
DROP TYPE "public"."credit_status";--> statement-breakpoint
DROP TYPE "public"."credit_type";--> statement-breakpoint
DROP TYPE "public"."currency";--> statement-breakpoint
DROP TYPE "public"."customer_category";--> statement-breakpoint
DROP TYPE "public"."customer_status";--> statement-breakpoint
DROP TYPE "public"."customer_type";--> statement-breakpoint
DROP TYPE "public"."device_status";--> statement-breakpoint
DROP TYPE "public"."device_type";--> statement-breakpoint
DROP TYPE "public"."fraud_type";--> statement-breakpoint
DROP TYPE "public"."gender";--> statement-breakpoint
DROP TYPE "public"."kyc_lock_step";--> statement-breakpoint
DROP TYPE "public"."kyc_status";--> statement-breakpoint
DROP TYPE "public"."login_status";--> statement-breakpoint
DROP TYPE "public"."partner_action_type";--> statement-breakpoint
DROP TYPE "public"."partner_limit_type";--> statement-breakpoint
DROP TYPE "public"."repayment_frequency";--> statement-breakpoint
DROP TYPE "public"."risk_level";--> statement-breakpoint
DROP TYPE "public"."security_question_type";--> statement-breakpoint
DROP TYPE "public"."setting_category";--> statement-breakpoint
DROP TYPE "public"."setting_type";--> statement-breakpoint
DROP TYPE "public"."transaction_status";--> statement-breakpoint
DROP TYPE "public"."transaction_type";