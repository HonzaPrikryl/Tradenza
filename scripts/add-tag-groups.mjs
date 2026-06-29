// Migrace: přidá tag_groups (kategorie tagů) + tags.group_id.
// Spuštění:  node --env-file=.env.local scripts/add-tag-groups.mjs
// Idempotentní – lze spustit opakovaně.

import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('❌ Chybí DATABASE_URL (node --env-file=.env.local scripts/add-tag-groups.mjs)')
  process.exit(1)
}

const sql = neon(url)

async function step(label, fn) {
  try {
    await fn()
    console.log('  ✓', label)
  } catch (err) {
    console.error('  ✗ Selhalo:', label)
    throw err
  }
}

console.log('▶ Spouštím migraci tag skupin…')

await step(
  'tabulka tag_groups',
  () => sql`
  CREATE TABLE IF NOT EXISTS tag_groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id text NOT NULL,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    created_at timestamptz NOT NULL DEFAULT now()
  );
`,
)

await step(
  'index tag_groups_user_id_idx',
  () => sql`
  CREATE INDEX IF NOT EXISTS tag_groups_user_id_idx ON tag_groups (user_id);
`,
)

await step(
  'sloupec tags.group_id',
  () => sql`
  ALTER TABLE tags ADD COLUMN IF NOT EXISTS group_id uuid;
`,
)

await step(
  'FK tags.group_id → tag_groups.id',
  () => sql`
  DO $$ BEGIN
    ALTER TABLE tags
      ADD CONSTRAINT tags_group_id_tag_groups_id_fk
      FOREIGN KEY (group_id) REFERENCES tag_groups(id) ON DELETE CASCADE;
  EXCEPTION WHEN duplicate_object THEN null; END $$;
`,
)

console.log('✅ Hotovo. tag_groups a tags.group_id jsou v databázi.')
