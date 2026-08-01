// Empties the shared candle cache so charts are re-fetched from the providers.
//
// Rarely needed — chunks that are finished and non-empty never go stale, and
// everything else re-fetches on its own TTL. Reach for this after changing how
// candles are fetched, resolved or aggregated, when the stored bars themselves
// are what's wrong.
//
// The cache repopulates automatically the next time a trade detail is opened.
//
// Run:
//   node --env-file=.env.local scripts/clear-candle-cache.mjs           # everything
//   node --env-file=.env.local scripts/clear-candle-cache.mjs NQ        # matching feed keys only

import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('❌ Missing DATABASE_URL (run with: node --env-file=.env.local scripts/clear-candle-cache.mjs)')
  process.exit(1)
}

const filter = process.argv[2]
const sql = neon(url)

const deleted = filter
  ? await sql`DELETE FROM market_candle_chunks WHERE feed_key ILIKE ${'%' + filter + '%'} RETURNING 1`
  : await sql`DELETE FROM market_candle_chunks RETURNING 1`

console.log(
  `✓ Deleted ${deleted.length} cached chunk(s)${filter ? ` matching "${filter}"` : ''}. Charts will re-fetch on next view.`,
)
