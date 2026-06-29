// Normalizace uložených dashboard templatů:
//  - kalendáři nastaví colSpan 2 / rowSpan 2 (2/3 šířky, 2 řádky)
//  - time-performance / duration-performance → colSpan 1, rowSpan 1
//  - přeřadí main: [ostatní…, calendar, time, duration] → kalendář vlevo 2/3,
//    time + duration naskládané vpravo a výškově zarovnané s kalendářem
//
// Spuštění:  node scripts/fix-dashboard-templates.mjs
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
      /* zkus další */
    }
  }
  throw new Error('DATABASE_URL nenalezeno')
}

const sql = neon(readDatabaseUrl())

function normalizeMain(main) {
  if (!Array.isArray(main)) return main
  const cal = main.find((w) => w.type === 'calendar')
  const time = main.find((w) => w.type === 'time-performance')
  const dur = main.find((w) => w.type === 'duration-performance')
  if (cal) {
    cal.colSpan = 2
    cal.rowSpan = 2
  }
  if (time) {
    time.colSpan = 1
    delete time.rowSpan
  }
  if (dur) {
    dur.colSpan = 1
    delete dur.rowSpan
  }

  // Přeřazení: ostatní (v původním pořadí) → calendar → time → duration
  const special = new Set(['calendar', 'time-performance', 'duration-performance'])
  const others = main.filter((w) => !special.has(w.type))
  const tail = [cal, time, dur].filter(Boolean)
  return [...others, ...tail]
}

const rows = await sql`SELECT id, name, layout FROM dashboard_templates`
console.log(`Nalezeno ${rows.length} templatů.`)

let fixed = 0
for (const row of rows) {
  const layout = typeof row.layout === 'string' ? JSON.parse(row.layout) : row.layout
  if (!layout?.main) continue
  const newMain = normalizeMain(layout.main)
  const newLayout = { ...layout, main: newMain }
  await sql`UPDATE dashboard_templates SET layout = ${JSON.stringify(newLayout)}::jsonb, updated_at = now() WHERE id = ${row.id}`
  fixed++
  console.log(`  ✓ ${row.name}`)
}

console.log(`Hotovo. Upraveno ${fixed} templatů. Refreshni dashboard.`)
process.exit(0)
