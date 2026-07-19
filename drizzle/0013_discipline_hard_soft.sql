CREATE TYPE "public"."rule_type" AS ENUM('hard', 'soft');--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "checked_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "progress_rules" ADD COLUMN "rule_type" "rule_type" DEFAULT 'soft' NOT NULL;