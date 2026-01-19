CREATE TABLE "email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient" text NOT NULL,
	"email_type" text NOT NULL,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"resend_id" text,
	"error_message" text,
	"metadata" jsonb,
	"sent_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX "email_logs_recipient_idx" ON "email_logs" USING btree ("recipient" text_ops);--> statement-breakpoint
CREATE INDEX "email_logs_sent_at_idx" ON "email_logs" USING btree ("sent_at" timestamp_ops);