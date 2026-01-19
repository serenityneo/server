CREATE TABLE "loyalty_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"point_type_code" varchar(50),
	"message" text NOT NULL,
	"animation_type" varchar(20) DEFAULT 'bounce',
	"is_read" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_point_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"points" integer NOT NULL,
	"applicable_to" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_redemptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"reward_id" integer NOT NULL,
	"points_spent" integer NOT NULL,
	"status" varchar(20) DEFAULT 'PENDING' NOT NULL,
	"metadata" jsonb,
	"redeemed_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"fulfilled_at" timestamp(3),
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loyalty_rewards" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" varchar(50) NOT NULL,
	"points_required" integer NOT NULL,
	"image_url" text,
	"stock_quantity" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamp(3) DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"customer_id" integer NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_signed" boolean DEFAULT false NOT NULL,
	"notification_type" varchar(50) DEFAULT 'NEW_CONTRACT' NOT NULL,
	"message" text,
	"priority" varchar(20) DEFAULT 'NORMAL',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp,
	"signed_at" timestamp,
	"expires_at" timestamp,
	"ip_address" varchar(50),
	"user_agent" text
);
--> statement-breakpoint
ALTER TABLE "serenity_points_ledger" ADD COLUMN "operation_type" text;--> statement-breakpoint
ALTER TABLE "serenity_points_ledger" ADD COLUMN "operation_id" integer;--> statement-breakpoint
ALTER TABLE "serenity_points_ledger" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "loyalty_notifications" ADD CONSTRAINT "loyalty_notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "loyalty_redemptions" ADD CONSTRAINT "loyalty_redemptions_reward_id_fkey" FOREIGN KEY ("reward_id") REFERENCES "public"."loyalty_rewards"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
CREATE INDEX "loyalty_notifications_customer_id_idx" ON "loyalty_notifications" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "loyalty_notifications_is_read_idx" ON "loyalty_notifications" USING btree ("is_read" bool_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_point_types_code_key" ON "loyalty_point_types" USING btree ("code" text_ops);--> statement-breakpoint
CREATE INDEX "loyalty_redemptions_customer_id_idx" ON "loyalty_redemptions" USING btree ("customer_id" int4_ops);--> statement-breakpoint
CREATE INDEX "loyalty_redemptions_reward_id_idx" ON "loyalty_redemptions" USING btree ("reward_id" int4_ops);--> statement-breakpoint
CREATE INDEX "loyalty_redemptions_status_idx" ON "loyalty_redemptions" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "loyalty_rewards_category_idx" ON "loyalty_rewards" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "loyalty_rewards_points_required_idx" ON "loyalty_rewards" USING btree ("points_required" int4_ops);