// Cílené vytvoření tabulek progress trackeru bez drizzle-kit push.
// Důvod: `drizzle-kit push` porovnává CELÉ schéma a na této DB padá na 42P16
// (pokus o přegenerování primary key u jiné, již existující tabulky).
// Tento skript jen přidá nové tabulky – idempotentně (IF NOT EXISTS).
//
// Spuštění:  node scripts/create-progress-tables.mjs
//
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  for (const file of ['.env.local', '.env']) {
    try {
      const content = readFileSync(join(__dirname, '..', file), 'utf8')
      const m = content.match(/^DATABASE_URL=(.*)$/m)
      if (m) return m[1].trim().replace(/^["']|["']$/g, '')
    } catch {
      /* soubor neexistuje – zkus další */
    }
  }
  throw new Error('DATABASE_URL nenalezeno v env ani v .env.local / .env')
}

const sql = neon(readDatabaseUrl())

console.log('→ Vytvářím progress_rules (IF NOT EXISTS)…')
await sql`
  CREATE TABLE IF NOT EXISTS "progress_rules" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "color" text DEFAULT '#34d399' NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
  )
`
await sql`CREATE INDEX IF NOT EXISTS "progress_rules_user_id_idx" ON "progress_rules" ("user_id")`

console.log('→ Vytvářím rule_completions (IF NOT EXISTS)…')
await sql`
  CREATE TABLE IF NOT EXISTS "rule_completions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "rule_id" uuid NOT NULL REFERENCES "progress_rules"("id") ON DELETE CASCADE,
    "date" text NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL
  )
`
await sql`CREATE INDEX IF NOT EXISTS "rule_completions_user_date_idx" ON "rule_completions" ("user_id","date")`
await sql`CREATE UNIQUE INDEX IF NOT EXISTS "rule_completions_rule_date_uniq" ON "rule_completions" ("rule_id","date")`

console.log('→ Vytvářím daily_checkins (IF NOT EXISTS)…')
await sql`
  CREATE TABLE IF NOT EXISTS "daily_checkins" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "date" text NOT NULL,
    "note" text,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
  )
`
await sql`CREATE UNIQUE INDEX IF NOT EXISTS "daily_checkins_user_date_uniq" ON "daily_checkins" ("user_id","date")`

for (const table of ['progress_rules', 'rule_completions', 'daily_checkins']) {
  const cols = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = ${table} ORDER BY ordinal_position
  `
  console.log(`✓ ${table}: ${cols.map((c) => c.column_name).join(', ')}`)
}
process.exit(0)
