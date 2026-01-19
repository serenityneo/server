CREATE TABLE "contract_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_url" varchar(500) NOT NULL,
	"file_type" varchar(100),
	"file_size" integer,
	"attachment_type" varchar(50),
	"description" text,
	"uploaded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"action" varchar(50) NOT NULL,
	"changed_by" integer NOT NULL,
	"changes" text,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_signatories" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"signatory_type" varchar(50) NOT NULL,
	"signatory_name" varchar(200) NOT NULL,
	"signatory_email" varchar(200),
	"signatory_phone" varchar(20),
	"signed" boolean DEFAULT false,
	"signed_date" timestamp,
	"signature_url" varchar(500),
	"ip_address" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_number" varchar(50) NOT NULL,
	"customer_id" integer NOT NULL,
	"created_by_user_id" integer,
	"approved_by_user_id" integer,
	"type" varchar(100) NOT NULL,
	"category" varchar(50),
	"status" varchar(20) DEFAULT 'DRAFT' NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"signed_date" timestamp,
	"approved_date" timestamp,
	"amount" numeric(15, 2),
	"currency" varchar(10) DEFAULT 'CDF',
	"interest_rate" numeric(5, 2),
	"title" varchar(200) NOT NULL,
	"terms" text,
	"notes" text,
	"document_url" varchar(500),
	"document_hash" varchar(128),
	"auto_renew" boolean DEFAULT false,
	"renewal_period_days" integer,
	"renewal_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "contracts_contract_number_unique" UNIQUE("contract_number")
);
