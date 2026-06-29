// Targeted creation of the global market candle cache table, without
// drizzle-kit push (which compares the WHOLE schema and fails on this DB with
// 42P16). Idempotent — only adds the new table (IF NOT EXISTS).
//
// Run:  node scripts/add-market-candles.mjs
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
      /* file missing – try next */
    }
  }
  throw new Error('DATABASE_URL not found in env or .env.local / .env')
}

const sql = neon(readDatabaseUrl())

console.log('→ Creating market_candles (IF NOT EXISTS)…')
await sql`
  CREATE TABLE IF NOT EXISTS "market_candles" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "symbol_root" text NOT NULL,
    "interval_sec" integer NOT NULL,
    "from_sec" integer NOT NULL,
    "to_sec" integer NOT NULL,
    "candles" jsonb NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL
  )
`
await sql`
  CREATE UNIQUE INDEX IF NOT EXISTS "market_candles_root_interval_uniq"
    ON "market_candles" ("symbol_root", "interval_sec")
`

const cols = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_name = 'market_candles' ORDER BY ordinal_position
`
console.log(`✓ market_candles: ${cols.map((c) => c.column_name).join(', ')}`)
process.exit(0)
