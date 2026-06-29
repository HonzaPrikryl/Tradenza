-- Baseline schema for Tradenza. Idempotent (IF NOT EXISTS / enum guards) so it can
-- be applied to a fresh database AND safely re-run to "baseline" a database that was
-- originally provisioned with `drizzle-kit push`.

DO $$ BEGIN
  CREATE TYPE "direction" AS ENUM('long', 'short');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "status" AS ENUM('open', 'closed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "asset_class" AS ENUM('stocks', 'futures', 'forex', 'crypto', 'options', 'other');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "firm" text,
  "broker" text,
  "timezone" text,
  "account_size" numeric(18, 2),
  "phase" text,
  "starting_balance" numeric(18, 2),
  "currency" text DEFAULT 'USD' NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "archived" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_user_id_idx" ON "accounts" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "trades" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "account_id" uuid REFERENCES "accounts"("id") ON DELETE set null,
  "symbol" text NOT NULL,
  "direction" "direction" NOT NULL,
  "status" "status" DEFAULT 'closed' NOT NULL,
  "asset_class" "asset_class" DEFAULT 'stocks' NOT NULL,
  "entry_price" numeric(18, 8) NOT NULL,
  "entry_quantity" numeric(18, 8) NOT NULL,
  "entry_datetime" timestamp with time zone NOT NULL,
  "exit_price" numeric(18, 8),
  "exit_quantity" numeric(18, 8),
  "exit_datetime" timestamp with time zone,
  "fees" numeric(18, 8) DEFAULT '0',
  "gross_pnl" numeric(18, 8),
  "net_pnl" numeric(18, 8),
  "stop_loss" numeric(18, 8),
  "take_profit" numeric(18, 8),
  "risk_reward_ratio" numeric(8, 4),
  "risk_amount" numeric(18, 8),
  "setup_name" text,
  "notes" text,
  "rating" real,
  "emotion_before" text,
  "emotion_after" text,
  "mistakes" text,
  "lessons" text,
  "import_source" text,
  "external_id" text,
  "extra" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_user_id_idx" ON "trades" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_symbol_idx" ON "trades" ("symbol");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_entry_datetime_idx" ON "trades" ("entry_datetime");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_account_id_idx" ON "trades" ("account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trades_external_id_idx" ON "trades" ("user_id", "external_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tag_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "color" text DEFAULT '#6366f1' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "tags" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "group_id" uuid REFERENCES "tag_groups"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "color" text DEFAULT '#6366f1' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "trade_tags" (
  "trade_id" uuid NOT NULL REFERENCES "trades"("id") ON DELETE cascade,
  "tag_id" uuid NOT NULL REFERENCES "tags"("id") ON DELETE cascade
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "screenshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "trade_id" uuid NOT NULL REFERENCES "trades"("id") ON DELETE cascade,
  "user_id" text NOT NULL,
  "url" text NOT NULL,
  "label" text,
  "sort_order" integer DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "candle_cache" (
  "trade_id" uuid PRIMARY KEY REFERENCES "trades"("id") ON DELETE cascade,
  "user_id" text NOT NULL,
  "interval_sec" integer NOT NULL,
  "candles" jsonb NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "import_logs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "account_id" uuid REFERENCES "accounts"("id") ON DELETE set null,
  "filename" text NOT NULL,
  "source" text NOT NULL,
  "total_rows" integer NOT NULL,
  "imported_rows" integer NOT NULL,
  "skipped_rows" integer DEFAULT 0 NOT NULL,
  "error_rows" integer DEFAULT 0 NOT NULL,
  "errors" jsonb,
  "trade_ids" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "dashboard_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_preset" boolean DEFAULT false NOT NULL,
  "layout" jsonb NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dashboard_templates_user_id_idx" ON "dashboard_templates" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "progress_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "progress_rules_user_id_idx" ON "progress_rules" ("user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "rule_completions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "rule_id" uuid NOT NULL REFERENCES "progress_rules"("id") ON DELETE cascade,
  "date" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rule_completions_user_date_idx" ON "rule_completions" ("user_id", "date");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rule_completions_rule_date_uniq" ON "rule_completions" ("rule_id", "date");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "daily_checkins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "date" text NOT NULL,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "daily_checkins_user_date_uniq" ON "daily_checkins" ("user_id", "date");
