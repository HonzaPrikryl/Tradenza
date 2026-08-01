// Smoke-tests every market-data provider the app can route a trade to, against
// the live APIs, for one representative instrument per asset class.
//
// This checks the *providers* — that the keys work, the datasets are entitled,
// the symbology still resolves and the bars come back priced sanely. How the
// app maps a trade onto a feed is covered by the unit tests in
// src/lib/market-data.test.ts; keep the expectations below in step with it.
//
// Run:
//   node --env-file=.env.local scripts/check-market-feeds.mjs

const DATABENTO = process.env.DATABENTO_API_KEY
const POLYGON = process.env.POLYGON_API_KEY
const BINANCE_BASE = process.env.BINANCE_API_BASE || 'https://data-api.binance.vision'
const EQUITIES = process.env.DATABENTO_EQUITIES_DATASET || 'XNAS.ITCH'

// A recent completed session; override for a different day.
const DAY = process.argv[2] ?? '2026-06-16'
const from = `${DAY}T14:00:00Z`
const to = `${DAY}T15:00:00Z`

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name.padEnd(34)} ${detail}`)
}

async function databento(params) {
  const res = await fetch(`https://hist.databento.com/v0/timeseries.get_range?${new URLSearchParams(params)}`, {
    headers: { Authorization: `Basic ${Buffer.from(`${DATABENTO}:`).toString('base64')}` },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 100).replace(/\s+/g, ' ')}`)
  return (await res.text())
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
}

const bars = (dataset, symbols, stypeIn, schema = 'ohlcv-1m', start = from, end = to) =>
  databento({
    dataset,
    symbols,
    stype_in: stypeIn,
    schema,
    start,
    end,
    encoding: 'json',
    pretty_px: 'true',
    pretty_ts: 'true',
    limit: '5000',
  })

async function check(name, run) {
  try {
    const detail = await run()
    record(name, true, detail)
  } catch (e) {
    record(name, false, e instanceof Error ? e.message : String(e))
  }
}

const priced = (rows) => rows.filter((r) => Number(r.close) > 0)
const summary = (rows) => `${rows.length} bars, close ${Number(rows.at(-1).close)}`

if (!DATABENTO) {
  console.log('… DATABENTO_API_KEY not set — skipping futures and stocks')
} else {
  await check('futures · CME front month', async () => {
    const rows = priced(await bars('GLBX.MDP3', 'NQ.v.0', 'continuous'))
    if (!rows.length) throw new Error('no bars')
    return summary(rows)
  })

  await check('futures · contract identification', async () => {
    const day = await bars('GLBX.MDP3', 'NQ.FUT', 'parent', 'ohlcv-1d', `${DAY}T00:00:00Z`, `${DAY}T23:59:00Z`)
    if (!day.length) throw new Error('parent symbology returned nothing')
    const busiest = day.reduce((a, b) => (Number(a.volume) > Number(b.volume) ? a : b))
    const exact = priced(await bars('GLBX.MDP3', String(busiest.hd.instrument_id), 'instrument_id'))
    if (!exact.length) throw new Error(`instrument ${busiest.hd.instrument_id} returned no bars`)
    return `${day.length} expiries, busiest ${busiest.hd.instrument_id} → ${summary(exact)}`
  })

  await check('futures · ICE softs', async () => {
    const rows = priced(await bars('IFUS.IMPACT', 'KC.v.0', 'continuous'))
    if (!rows.length) throw new Error('no bars')
    return summary(rows)
  })

  await check('futures · Cboe volatility', async () => {
    const rows = priced(await bars('XCBF.PITCH', 'VX.v.0', 'continuous'))
    if (!rows.length) throw new Error('no bars')
    return summary(rows)
  })

  await check(`stocks · ${EQUITIES}`, async () => {
    const rows = priced(await bars(EQUITIES, 'AAPL', 'raw_symbol'))
    if (!rows.length) throw new Error('no bars')
    return summary(rows)
  })
}

if (!POLYGON) {
  console.log('… POLYGON_API_KEY not set — skipping forex')
} else {
  await check('forex · Polygon', async () => {
    const url =
      `https://api.polygon.io/v2/aggs/ticker/C:EURUSD/range/1/minute/${Date.parse(from)}/${Date.parse(to)}` +
      `?adjusted=true&sort=asc&limit=10000&apiKey=${POLYGON}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { results: rows } = await res.json()
    if (!rows?.length) throw new Error('no bars')
    return `${rows.length} bars, close ${rows.at(-1).c}`
  })
}

await check('crypto · Binance', async () => {
  const url = `${BINANCE_BASE}/api/v3/klines?symbol=BTCUSDT&interval=1m&startTime=${Date.parse(from)}&endTime=${Date.parse(to)}&limit=1000`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const rows = await res.json()
  if (!Array.isArray(rows) || !rows.length) throw new Error('no bars')
  return `${rows.length} bars, close ${rows.at(-1)[4]}`
})

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} feeds healthy on ${DAY}`)
if (failed.length) process.exit(1)
