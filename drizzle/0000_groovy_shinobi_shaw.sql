CREATE TYPE "public"."account_status" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."account_type" AS ENUM('S01_STANDARD', 'S02_MANDATORY_SAVINGS', 'S03_CAUTION', 'S04_CREDIT', 'S05_BWAKISA_CARTE', 'S06_FINES');--> statement-breakpoint
CREATE TYPE "public"."civil_status" AS ENUM('SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED');--> statement-breakpoint
CREATE TYPE "public"."credit_status" AS ENUM('PENDING', 'APPROVED', 'DISBURSED', 'ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."credit_type" AS ENUM('VIMBISA', 'BOMBE', 'TELEMA', 'MOPAO', 'LIKELEMBA');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('CDF', 'USD');--> statement-breakpoint
CREATE TYPE "public"."customer_category" AS ENUM('CATEGORY_1', 'CATEGORY_2', 'GOLD');--> statement-breakpoint
CREATE TYPE "public"."customer_status" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."customer_type" AS ENUM('MEMBER', 'PARTNER');--> statement-breakpoint
CREATE TYPE "public"."device_status" AS ENUM('TRUSTED', 'PENDING', 'SUSPICIOUS', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "public"."device_type" AS ENUM('MOBILE', 'DESKTOP', 'TABLET', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."fraud_type" AS ENUM('LOCATION_ANOMALY', 'DEVICE_ANOMALY', 'BEHAVIORAL_ANOMALY', 'VPN_PROXY_DETECTED', 'MULTIPLE_DEVICES', 'RAPID_TRANSACTIONS', 'SUSPICIOUS_PATTERN');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('M', 'F');--> statement-breakpoint
CREATE TYPE "public"."kyc_lock_step" AS ENUM('NONE', 'STEP1', 'STEP2', 'STEP3');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('NOT_STARTED', 'KYC1_PENDING', 'KYC1_COMPLETED', 'KYC2_PENDING', 'KYC2_UNDER_REVIEW', 'KYC2_VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."login_status" AS ENUM('SUCCESS', 'FAILED_PASSWORD', 'FAILED_OTP', 'BLOCKED_SUSPICIOUS', 'BLOCKED_DEVICE', 'BLOCKED_LOCATION', 'FAILED_SECURITY_QUESTION');--> statement-breakpoint
CREATE TYPE "public"."partner_action_type" AS ENUM('CREATE_CUSTOMER', 'UPDATE_CUSTOMER', 'DEPOSIT', 'WITHDRAWAL', 'CREDIT_APPLICATION', 'CREDIT_APPROVAL', 'ACCOUNT_SUSPENSION', 'DOCUMENT_UPLOAD', 'KYC_VALIDATION', 'TRANSACTION_REVERSAL');--> statement-breakpoint
CREATE TYPE "public"."partner_limit_type" AS ENUM('DAILY_TRANSACTIONS', 'MONTHLY_TRANSACTIONS', 'SINGLE_TRANSACTION', 'CUSTOMER_CREATION', 'CREDIT_APPROVAL');--> statement-breakpoint
CREATE TYPE "public"."repayment_frequency" AS ENUM('DAILY', 'WEEKLY', 'MONTHLY');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');--> statement-breakpoint
CREATE TYPE "public"."security_question_type" AS ENUM('PERSONAL', 'FAMILY', 'PREFERENCE', 'HISTORICAL');--> statement-breakpoint
CREATE TYPE "public"."setting_category" AS ENUM('SYSTEM', 'SECURITY', 'CREDIT', 'EXCHANGE_RATES', 'FEES', 'LIMITS', 'NOTIFICATIONS', 'BUSINESS_RULES');--> statement-breakpoint
CREATE TYPE "public"."setting_type" AS ENUM('STRING', 'INTEGER', 'FLOAT', 'BOOLEAN', 'JSON');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'CREDIT_DISBURSEMENT', 'CREDIT_REPAYMENT', 'FEE', 'INTEREST');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"account_number" text NOT NULL,
	"account_type" "account_type" NOT NULL,
	"currency" "currency" DEFAULT 'CDF' NOT NULL,
	"balance_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"balance_usd" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" "account_status" DEFAULT 'ACTIVE' NOT NULL,
	"opened_date" timestamp DEFAULT now() NOT NULL,
	"closed_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_account_number_unique" UNIQUE("account_number")
);
--> statement-breakpoint
CREATE TABLE "agencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"commune_id" integer,
	"active" boolean DEFAULT true NOT NULL,
	"address" text,
	"phone" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agencies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "bwakisa_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"target_amount" numeric(15, 2),
	"periodicity" text NOT NULL,
	"maturity_date" timestamp,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'ACTIVE',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cities" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"city_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "countries" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "countries_name_unique" UNIQUE("name"),
	CONSTRAINT "countries_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"cif" text,
	"credit_type" "credit_type" NOT NULL,
	"amount_cdf" numeric(15, 2) NOT NULL,
	"amount_usd" numeric(15, 2),
	"processing_fee_cdf" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_to_repay_cdf" numeric(15, 2) NOT NULL,
	"interest_rate" numeric(5, 4) NOT NULL,
	"repayment_frequency" "repayment_frequency" NOT NULL,
	"installment_amount_cdf" numeric(15, 2) NOT NULL,
	"number_of_installments" integer NOT NULL,
	"application_date" timestamp DEFAULT now() NOT NULL,
	"approval_date" timestamp,
	"disbursement_date" timestamp,
	"first_payment_date" timestamp,
	"last_payment_date" timestamp,
	"maturity_date" timestamp,
	"credit_status" "credit_status" DEFAULT 'PENDING' NOT NULL,
	"product_config" json,
	"eligibility_snapshot" json,
	"repayment_schedule" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text,
	"last_name" text,
	"mobile_money_number" text,
	"email" text,
	"date_of_birth" timestamp,
	"place_of_birth" text,
	"civil_status" text,
	"gender" text,
	"nationality" text,
	"address" text,
	"quartier_id" integer,
	"postal_code_id" integer,
	"profession" text,
	"employer" text,
	"monthly_income" numeric(15, 2),
	"id_card_number" text,
	"id_card_expiry" timestamp,
	"id_card_front_url" text,
	"id_card_back_url" text,
	"face_photo_url" text,
	"signature_photo_url" text,
	"passport_number" text,
	"passport_expiry" timestamp,
	"passport_url" text,
	"birth_certificate_url" text,
	"residence_certificate_url" text,
	"income_proof_url" text,
	"reference_name" text,
	"reference_phone" text,
	"reference_relationship" text,
	"is_political_person" boolean,
	"status" "customer_status",
	"kyc_status" "kyc_status",
	"kyc_step" integer DEFAULT 0 NOT NULL,
	"kyc_completed" boolean DEFAULT false NOT NULL,
	"kyc_lock_step" "kyc_lock_step" DEFAULT 'NONE' NOT NULL,
	"category" "customer_category",
	"customer_type" "customer_type" DEFAULT 'MEMBER' NOT NULL,
	"partner_code" text,
	"partner_level" text,
	"commission_rate" numeric(5, 4),
	"territory_assigned" text,
	"supervisor_id" integer,
	"managed_by_partner_id" integer,
	"max_daily_operations" integer DEFAULT 50,
	"max_transaction_amount" numeric(15, 2),
	"requires_dual_approval" boolean DEFAULT false,
	"partner_actions_count" integer DEFAULT 0,
	"last_action_date" timestamp,
	"suspicious_activity_count" integer DEFAULT 0,
	"kyc1_completion_date" timestamp,
	"kyc2_submission_date" timestamp,
	"kyc2_validation_date" timestamp,
	"gold_eligible_date" timestamp,
	"password_hash" text,
	"is_active" boolean,
	"last_login" timestamp,
	"otp_verified" boolean DEFAULT false NOT NULL,
	"cif_code" text,
	"public_id" text,
	"mfa_enabled" boolean DEFAULT false,
	"mfa_secret" text,
	"mfa_backup_codes" json,
	"mfa_configured_at" timestamp,
	"account_creation_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by_id" integer,
	"business_documents" json,
	"agency_id" integer,
	CONSTRAINT "customers_mobile_money_number_unique" UNIQUE("mobile_money_number"),
	CONSTRAINT "customers_email_unique" UNIQUE("email"),
	CONSTRAINT "customers_cif_code_unique" UNIQUE("cif_code"),
	CONSTRAINT "customers_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "postal_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"quartier_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quartiers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"commune_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer,
	"credit_id" integer,
	"transaction_type" "transaction_type" NOT NULL,
	"amount_cdf" numeric(15, 2) NOT NULL,
	"amount_usd" numeric(15, 2),
	"currency" "currency" DEFAULT 'CDF' NOT NULL,
	"description" text,
	"reference_number" text,
	"status" "transaction_status" DEFAULT 'PENDING' NOT NULL,
	"processed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_reference_number_unique" UNIQUE("reference_number")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" integer NOT NULL,
	"validated" boolean NOT NULL,
	"otp_code" text,
	"otp_expires_at" timestamp,
	"last_login" timestamp,
	"last_logout" timestamp,
	"last_ip" text,
	"last_browser" text,
	"last_machine" text,
	"last_country" text,
	"is_active" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agencies" ADD CONSTRAINT "agencies_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bwakisa_services" ADD CONSTRAINT "bwakisa_services_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cities" ADD CONSTRAINT "cities_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communes" ADD CONSTRAINT "communes_city_id_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credits" ADD CONSTRAINT "credits_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_quartier_id_quartiers_id_fk" FOREIGN KEY ("quartier_id") REFERENCES "public"."quartiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_postal_code_id_postal_codes_id_fk" FOREIGN KEY ("postal_code_id") REFERENCES "public"."postal_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_agency_id_agencies_id_fk" FOREIGN KEY ("agency_id") REFERENCES "public"."agencies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "postal_codes" ADD CONSTRAINT "postal_codes_quartier_id_quartiers_id_fk" FOREIGN KEY ("quartier_id") REFERENCES "public"."quartiers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quartiers" ADD CONSTRAINT "quartiers_commune_id_communes_id_fk" FOREIGN KEY ("commune_id") REFERENCES "public"."communes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_credit_id_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."credits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;