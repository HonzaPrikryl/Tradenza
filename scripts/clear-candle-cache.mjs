// Empties the candle cache so charts are re-fetched with the new window
// (1m → 2 h, 30m → 8 h, 1h → 24 h on each side).
//
// The cache repopulates automatically the next time a trade detail is opened.
//
// Run:
//   node --env-file=.env.local scripts/clear-candle-cache.mjs

import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('❌ Missing DATABASE_URL (run with: node --env-file=.env.local scripts/clear-candle-cache.mjs)')
  process.exit(1)
}

const sql = neon(url)

const before = await sql`SELECT count(*)::int AS n FROM candle_cache`
await sql`DELETE FROM candle_cache`
console.log(`✓ Deleted ${before[0].n} rows from candle_cache. Charts will re-fetch on next view.`)
