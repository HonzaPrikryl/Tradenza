CREATE TYPE "public"."asset_class" AS ENUM('stocks', 'futures', 'forex', 'crypto', 'options', 'other');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('long', 'short');--> statement-breakpoint
CREATE TYPE "public"."status" AS ENUM('open', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "accounts" (
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
CREATE TABLE "candle_cache" (
	"trade_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"interval_sec" integer NOT NULL,
	"candles" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_templates" (
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
CREATE TABLE "import_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid,
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
CREATE TABLE "market_candles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol_root" text NOT NULL,
	"interval_sec" integer NOT NULL,
	"from_sec" integer NOT NULL,
	"to_sec" integer NOT NULL,
	"candles" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"active_days" integer[] DEFAULT '{1,2,3,4,5,6,7}'::integer[] NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"rule_id" uuid NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"url" text NOT NULL,
	"label" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"group_id" uuid,
	"name" text NOT NULL,
	"color" text DEFAULT '#6366f1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trade_tags" (
	"trade_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid,
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
ALTER TABLE "candle_cache" ADD CONSTRAINT "candle_cache_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_logs" ADD CONSTRAINT "import_logs_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_completions" ADD CONSTRAINT "rule_completions_rule_id_progress_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."progress_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenshots" ADD CONSTRAINT "screenshots_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_group_id_tag_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."tag_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_trade_id_trades_id_fk" FOREIGN KEY ("trade_id") REFERENCES "public"."trades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_tags" ADD CONSTRAINT "trade_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_checkins_user_date_uniq" ON "daily_checkins" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "dashboard_templates_user_id_idx" ON "dashboard_templates" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_candles_root_interval_uniq" ON "market_candles" USING btree ("symbol_root","interval_sec");--> statement-breakpoint
CREATE INDEX "progress_rules_user_id_idx" ON "progress_rules" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "rule_completions_user_date_idx" ON "rule_completions" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_completions_rule_date_uniq" ON "rule_completions" USING btree ("rule_id","date");--> statement-breakpoint
CREATE INDEX "trades_user_id_idx" ON "trades" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trades_symbol_idx" ON "trades" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "trades_entry_datetime_idx" ON "trades" USING btree ("entry_datetime");--> statement-breakpoint
CREATE INDEX "trades_account_id_idx" ON "trades" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "trades_external_id_idx" ON "trades" USING btree ("user_id","external_id");