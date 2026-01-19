CREATE TABLE "document_hashes" (
	"hash" text PRIMARY KEY NOT NULL,
	"doc_type" text,
	"customer_id" integer,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "account_type_code" varchar(3);--> statement-breakpoint
CREATE INDEX "idx_document_hashes_type_customer" ON "document_hashes" USING btree ("doc_type" text_ops,"customer_id" int4_ops);--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_account_type_code_fkey" FOREIGN KEY ("account_type_code") REFERENCES "public"."account_types"("code") ON DELETE restrict ON UPDATE cascade;