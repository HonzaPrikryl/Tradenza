// Vyprázdní cache svíček, aby se grafy znovu natáhly s novým oknem
// (1m → 2 h, 30m → 8 h, 1h → 24 h na každou stranu).
//
// Cache se naplní znovu automaticky při příštím otevření detailu tradu.
//
// Spuštění:
//   node --env-file=.env.local scripts/clear-candle-cache.mjs

import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('❌ Chybí DATABASE_URL (spusť s: node --env-file=.env.local scripts/clear-candle-cache.mjs)')
  process.exit(1)
}

const sql = neon(url)

const before = await sql`SELECT count(*)::int AS n FROM candle_cache`
await sql`DELETE FROM candle_cache`
console.log(`✓ Smazáno ${before[0].n} záznamů z candle_cache. Grafy se natáhnou znovu při příštím zobrazení.`)
