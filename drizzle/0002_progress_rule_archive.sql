-- Soft-delete / effective-end for discipline rules. Lets a deleted or paused rule
-- keep counting toward the days it was in effect (historical accuracy) instead of
-- retroactively changing past days.
ALTER TABLE "progress_rules" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone;
