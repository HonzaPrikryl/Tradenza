CREATE TYPE "public"."away_scope" AS ENUM('both', 'trading', 'habits');--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD COLUMN "away_scope" "away_scope" DEFAULT 'both' NOT NULL;