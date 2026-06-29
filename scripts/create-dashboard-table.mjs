// Cílené vytvoření tabulky `dashboard_templates` bez drizzle-kit push.
// Důvod: `drizzle-kit push` porovnává CELÉ schéma a na této DB padá na 42P16
// (pokus o přegenerování primary key u jiné, již existující tabulky).
// Tento skript jen přidá novou tabulku – idempotentně (IF NOT EXISTS).
//
// Spuštění:  node scripts/create-dashboard-table.mjs
//
import { neon } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Načti DATABASE_URL z .env.local nebo .env (bez závislosti na dotenv)
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

console.log('→ Vytvářím dashboard_templates (IF NOT EXISTS)…')

await sql`
  CREATE TABLE IF NOT EXISTS "dashboard_templates" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" text NOT NULL,
    "name" text NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "is_preset" boolean DEFAULT false NOT NULL,
    "layout" jsonb NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
  )
`

await sql`CREATE INDEX IF NOT EXISTS "dashboard_templates_user_id_idx" ON "dashboard_templates" ("user_id")`

const cols = await sql`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'dashboard_templates'
  ORDER BY ordinal_position
`

console.log('✓ Hotovo. Sloupce tabulky dashboard_templates:')
for (const c of cols) console.log(`   - ${c.column_name} (${c.data_type})`)
process.exit(0)
