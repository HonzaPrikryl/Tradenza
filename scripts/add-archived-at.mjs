// Přidá sloupec progress_rules.archived_at bez drizzle-kit push.
// Důvod: `drizzle-kit push` porovnává CELÉ schéma a na této DB padá na 42P16
// (pokus o přegenerování primary key u jiné, již existující tabulky).
// Tento skript jen přidá nový sloupec – idempotentně (ADD COLUMN IF NOT EXISTS).
//
// Spuštění:  node scripts/add-archived-at.mjs
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

console.log('→ Přidávám progress_rules.archived_at (IF NOT EXISTS)…')
await sql`ALTER TABLE "progress_rules" ADD COLUMN IF NOT EXISTS "archived_at" timestamptz`

const cols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'progress_rules' ORDER BY ordinal_position
`
console.log(`✓ progress_rules: ${cols.map((c) => c.column_name).join(', ')}`)
process.exit(0)
