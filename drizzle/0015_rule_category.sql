CREATE TYPE "public"."rule_category" AS ENUM('trading', 'habit');--> statement-breakpoint
ALTER TABLE "progress_rules" ADD COLUMN "category" "rule_category" DEFAULT 'trading' NOT NULL;