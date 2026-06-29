-- Dashboard templates (rozložení nástěnky). Spusť: npm run db:push  (nebo aplikuj tento SQL)
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
CREATE INDEX IF NOT EXISTS "dashboard_templates_user_id_idx" ON "dashboard_templates" ("user_id");
