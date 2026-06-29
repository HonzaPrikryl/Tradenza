// Tvrdý reset databáze: zahodí celé schéma `public` a vytvoří ho prázdné.
// Tím se opraví drizzle-kit push, který na téhle DB padal na PK driftu
// ("column \"id\" is in a primary key"), a zároveň zmizí starý český
// "Generický účet" – aplikace si ho po resetu vytvoří znovu už anglicky.
//
// ⚠  SMAŽE VŠECHNA DATA. Spouštěj jen na dev databázi.
//
// Spuštění:
//   node --env-file=.env.local scripts/reset-db.mjs
//   npm run db:push        # znovu postaví schéma podle src/lib/db/schema.ts

import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL
if (!url) {
  console.error('❌ Chybí DATABASE_URL (spusť s: node --env-file=.env.local scripts/reset-db.mjs)')
  process.exit(1)
}

const sql = neon(url)

async function step(label, fn) {
  try {
    await fn()
    console.log('  ✓', label)
  } catch (e) {
    console.error('  ✗', label, '\n   ', e.message)
    process.exit(1)
  }
}

console.log('⚠  Mažu schéma public (všechna data budou ztracena)…')
await step('DROP SCHEMA public CASCADE', () => sql`DROP SCHEMA public CASCADE`)
await step('CREATE SCHEMA public', () => sql`CREATE SCHEMA public`)

console.log('\n✅ Hotovo. Teď spusť:  npm run db:push')
