CREATE TABLE "progress_rule_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"rule_id" uuid NOT NULL,
	"effective_to" text NOT NULL,
	"active_days" integer[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "progress_rule_schedules" ADD CONSTRAINT "progress_rule_schedules_rule_id_progress_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."progress_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "progress_rule_schedules_user_id_idx" ON "progress_rule_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_rule_schedules_rule_day_uniq" ON "progress_rule_schedules" USING btree ("rule_id","effective_to");