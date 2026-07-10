ALTER TABLE "strategies" ADD COLUMN "entry_checklist" jsonb;--> statement-breakpoint
ALTER TABLE "strategies" ADD COLUMN "exit_checklist" jsonb;--> statement-breakpoint
UPDATE "strategies" SET "entry_checklist" = "checklist" WHERE "checklist" IS NOT NULL;
