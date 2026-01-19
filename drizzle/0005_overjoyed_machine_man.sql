CREATE TABLE "billing_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"account_id" integer,
	"billing_type" text NOT NULL,
	"service_type" text,
	"description" text NOT NULL,
	"amount_usd" numeric(10, 2) NOT NULL,
	"amount_cdf" numeric(10, 2) NOT NULL,
	"currency_charged" text NOT NULL,
	"billing_period_start" timestamp(3) NOT NULL,
	"billing_period_end" timestamp(3) NOT NULL,
	"charged_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"transaction_id" integer,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_repayments" (
	"id" serial PRIMARY KEY NOT NULL,
	"credit_request_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"allocation_id" integer NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"payment_method" text,
	"source_account_id" integer,
	"repaid_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"processed_by" integer,
	"notes" text,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"s04_account_id" integer NOT NULL,
	"allocation_id" integer NOT NULL,
	"request_number" text NOT NULL,
	"amount_requested" numeric(15, 2) NOT NULL,
	"amount_approved" numeric(15, 2),
	"commission_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"net_amount" numeric(15, 2),
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"approved_at" timestamp(3),
	"disbursed_at" timestamp(3),
	"approved_by" integer,
	"rejection_reason" text,
	"due_date" timestamp(3),
	"repayment_status" text DEFAULT 'UNPAID' NOT NULL,
	"amount_repaid" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_account_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"account_id" integer NOT NULL,
	"sms_enabled" boolean DEFAULT false NOT NULL,
	"email_enabled" boolean DEFAULT false NOT NULL,
	"push_notification_enabled" boolean DEFAULT false NOT NULL,
	"in_app_notification_enabled" boolean DEFAULT true NOT NULL,
	"services_activated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"monthly_total_fee_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"monthly_total_fee_cdf" numeric(10, 2) DEFAULT '0' NOT NULL,
	"last_billing_date" timestamp(3),
	"next_billing_date" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_credit_eligibility" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"eligibility_status" text DEFAULT 'NEUTRAL' NOT NULL,
	"credit_score" integer DEFAULT 0 NOT NULL,
	"max_credit_limit" numeric(15, 2) DEFAULT '0' NOT NULL,
	"current_credit_used" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_loans_completed" integer DEFAULT 0 NOT NULL,
	"total_loans_defaulted" integer DEFAULT 0 NOT NULL,
	"on_time_repayment_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"blacklist_reason" text,
	"blacklisted_at" timestamp(3),
	"blacklisted_by" integer,
	"whitelist_reason" text,
	"whitelisted_at" timestamp(3),
	"whitelisted_by" integer,
	"last_review_date" timestamp(3),
	"next_review_date" timestamp(3),
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_service_fees" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_type" text NOT NULL,
	"service_name" text NOT NULL,
	"description" text,
	"monthly_fee_usd" numeric(10, 2) DEFAULT '0' NOT NULL,
	"monthly_fee_cdf" numeric(10, 2) DEFAULT '0' NOT NULL,
	"is_free" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "s04_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"s04_account_id" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"total_allocated" numeric(15, 2) DEFAULT '0' NOT NULL,
	"total_debt" numeric(15, 2) DEFAULT '0' NOT NULL,
	"available_balance" numeric(15, 2) DEFAULT '0' NOT NULL,
	"commission_rate" numeric(5, 4) DEFAULT '0.10' NOT NULL,
	"commission_collected" numeric(15, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"public_id" text NOT NULL,
	"ticket_type" text NOT NULL,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'MEDIUM' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"related_service" text,
	"assigned_to" integer,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"resolved_at" timestamp(3),
	"closed_at" timestamp(3)
);
--> statement-breakpoint
CREATE TABLE "ticket_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"ticket_id" text NOT NULL,
	"sender_type" text NOT NULL,
	"sender_id" integer,
	"message" text NOT NULL,
	"is_internal_note" boolean DEFAULT false NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_history" ADD CONSTRAINT "billing_history_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "billing_history" ADD CONSTRAINT "billing_history_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD CONSTRAINT "credit_repayments_credit_request_id_fkey" FOREIGN KEY ("credit_request_id") REFERENCES "public"."credit_requests"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "credit_repayments" ADD CONSTRAINT "credit_repayments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_s04_account_id_fkey" FOREIGN KEY ("s04_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "credit_requests" ADD CONSTRAINT "credit_requests_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "public"."s04_allocations"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_account_services" ADD CONSTRAINT "customer_account_services_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_account_services" ADD CONSTRAINT "customer_account_services_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "customer_credit_eligibility" ADD CONSTRAINT "customer_credit_eligibility_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "s04_allocations" ADD CONSTRAINT "s04_allocations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "s04_allocations" ADD CONSTRAINT "s04_allocations_s04_account_id_fkey" FOREIGN KEY ("s04_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "billing_history_customer_id_charged_at_idx" ON "billing_history" USING btree ("customer_id" int4_ops,"charged_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "billing_history_billing_type_charged_at_idx" ON "billing_history" USING btree ("billing_type" text_ops,"charged_at" timestamp_ops);--> statement-breakpoint
CREATE INDEX "credit_repayments_credit_request_id_idx" ON "credit_repayments" USING btree ("credit_request_id" int4_ops);--> statement-breakpoint
CREATE INDEX "credit_repayments_customer_id_idx" ON "credit_repayments" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "credit_requests_request_number_key" ON "credit_requests" USING btree ("request_number" text_ops);--> statement-breakpoint
CREATE INDEX "credit_requests_customer_id_idx" ON "credit_requests" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "credit_requests_status_idx" ON "credit_requests" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "credit_requests_allocation_id_idx" ON "credit_requests" USING btree ("allocation_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "customer_account_services_customer_id_account_id_key" ON "customer_account_services" USING btree ("customer_id" int4_ops,"account_id" int4_ops);--> statement-breakpoint
CREATE INDEX "customer_account_services_customer_id_idx" ON "customer_account_services" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "customer_account_services_next_billing_date_idx" ON "customer_account_services" USING btree ("next_billing_date" timestamp_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "customer_credit_eligibility_customer_id_key" ON "customer_credit_eligibility" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "customer_credit_eligibility_eligibility_status_idx" ON "customer_credit_eligibility" USING btree ("eligibility_status" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "notification_service_fees_service_type_key" ON "notification_service_fees" USING btree ("service_type" text_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "s04_allocations_customer_id_s04_account_id_currency_key" ON "s04_allocations" USING btree ("customer_id" int4_ops,"s04_account_id" int4_ops,"currency" text_ops);--> statement-breakpoint
CREATE INDEX "s04_allocations_customer_id_idx" ON "s04_allocations" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "s04_allocations_s04_account_id_idx" ON "s04_allocations" USING btree ("s04_account_id" int4_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_public_id_key" ON "support_tickets" USING btree ("public_id" text_ops);--> statement-breakpoint
CREATE INDEX "support_tickets_customer_id_status_idx" ON "support_tickets" USING btree ("customer_id" int4_ops,"status" text_ops);--> statement-breakpoint
CREATE INDEX "support_tickets_status_priority_idx" ON "support_tickets" USING btree ("status" text_ops,"priority" text_ops);--> statement-breakpoint
CREATE INDEX "ticket_messages_ticket_id_created_at_idx" ON "ticket_messages" USING btree ("ticket_id" text_ops,"created_at" timestamp_ops);