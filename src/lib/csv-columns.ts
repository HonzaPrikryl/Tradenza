export const CSV_REQUIRED_FIELDS = ['symbol', 'entryPrice', 'entryDatetime'] as const

export const COLUMN_CANDIDATES: Record<string, string[]> = {
  symbol: ['symbol', 'ticker', 'instrument', 'contract', 'market'],
  direction: ['side', 'direction', 'b/s', 'buy/sell', 'type', 'position'],
  quantity: ['qty', 'quantity', 'size', 'filled qty', 'lots', 'volume', 'contracts'],
  entryPrice: ['entry price', 'open price', 'avg. entry price', 'avg entry price', 'buy price', 'price'],
  exitPrice: ['exit price', 'close price', 'avg. exit price', 'avg exit price', 'sell price'],
  entryDatetime: [
    'entry time',
    'open time',
    'open date',
    'entry date',
    'opened',
    'date/time',
    'datetime',
    'entry datetime',
    'time',
    'date',
  ],
  exitDatetime: ['exit time', 'close time', 'close date', 'exit date', 'closed', 'exit datetime'],
  fees: ['commission', 'commissions', 'comm', 'fees', 'fee', 'total fees'],
  grossPnl: ['gross p&l', 'gross pnl'],
  netPnl: ['net p&l', 'net pnl', 'pnl', 'p&l', 'profit', 'realized p&l', 'profit/loss', 'realized pnl'],
  setupName: ['setup', 'strategy'],
  notes: ['notes', 'note', 'comment', 'comments'],
}

export function detectColumns(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {}
  const norm = headers.map((h) => h.trim().toLowerCase())
  for (const [field, candidates] of Object.entries(COLUMN_CANDIDATES)) {
    for (const c of candidates) {
      const idx = norm.indexOf(c)
      if (idx !== -1 && !Object.values(mapping).includes(headers[idx])) {
        mapping[field] = headers[idx]
        break
      }
    }
  }
  return mapping
}

export const IMPORT_FIELDS = [
  'symbol',
  'side',
  'entryPrice',
  'exitPrice',
  'entryDate',
  'entryTime',
  'exitDate',
  'exitTime',
  'quantity',
  'fees',
  'grossPnl',
  'netPnl',
  'setupName',
  'notes',
] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]
export const IMPORT_REQUIRED: ImportField[] = ['symbol', 'entryPrice', 'entryDate']

const HEADER_KEYWORDS = [
  'symbol',
  'ticker',
  'instrument',
  'contract',
  'buy/sell',
  'side',
  'b/s',
  'qty',
  'quantity',
  'price',
  'time',
  'date',
  'status',
  'commission',
  'fee',
]

function keywordScore(row: string[]): number {
  return row.filter((c) => {
    const v = (c ?? '').trim().toLowerCase()
    return v.length > 0 && HEADER_KEYWORDS.some((k) => v.includes(k))
  }).length
}

export function extractTable(matrix: string[][]): { headers: string[]; rows: Record<string, string>[] } {
  const nonEmpty = matrix.filter((r) => r.some((c) => (c ?? '').trim() !== ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }

  let headerIdx = -1
  let best = -1
  for (let i = 0; i < nonEmpty.length; i++) {
    const s = keywordScore(nonEmpty[i])
    const len = nonEmpty[i].length
    const next = nonEmpty[i + 1]
    const hasData = !!next && next.length === len && keywordScore(next) < s
    if (s >= 3 && hasData && s > best) {
      best = s
      headerIdx = i
    }
  }
  if (headerIdx === -1) headerIdx = 0

  const headers = nonEmpty[headerIdx].map((h, i) => (h ?? '').trim() || `col${i + 1}`)
  const len = headers.length
  const rows: Record<string, string>[] = []
  for (let i = headerIdx + 1; i < nonEmpty.length; i++) {
    const r = nonEmpty[i]
    if (r.length !== len) continue
    if (best >= 3 && keywordScore(r) >= best) continue
    const obj: Record<string, string> = {}
    headers.forEach((h, j) => (obj[h] = (r[j] ?? '').trim()))
    if (Object.values(obj).some((v) => v)) rows.push(obj)
  }
  return { headers, rows }
}

// ─── Fill / order log (executions) ────────────────────────────────────────────

export const FILL_FIELDS = ['symbol', 'side', 'quantity', 'price', 'datetime', 'commission', 'status'] as const
export type FillField = (typeof FILL_FIELDS)[number]
export const FILL_REQUIRED: FillField[] = ['symbol', 'side', 'quantity', 'price', 'datetime']

export function looksLikeFills(headers: string[]): boolean {
  const h = headers.map((x) => x.trim().toLowerCase())
  const hasSide = h.some((x) => x.includes('buy/sell') || x === 'side' || x === 'b/s')
  const hasFill = h.some((x) => x.includes('qty filled') || x.includes('avg fill price') || x.includes('fill price'))
  return hasSide && hasFill
}

export function buildFillMapping(headers: string[]): Partial<Record<FillField, string>> {
  const norm = headers.map((h) => h.trim().toLowerCase())
  const find = (cands: string[]): string | undefined => {
    for (const c of cands) {
      const i = norm.findIndex((x) => x === c || x.includes(c))
      if (i !== -1) return headers[i]
    }
    return undefined
  }
  const map: Partial<Record<FillField, string>> = {}
  const symbol = find(['symbol', 'instrument', 'contract', 'ticker'])
  const side = find(['buy/sell', 'side', 'b/s'])
  const qty = find(['qty filled', 'quantity', 'qty'])
  const price = find(['avg fill price', 'fill price', 'price'])
  const datetime = find(['last fill time', 'fill time', 'update time', 'date/time', 'datetime', 'time', 'create time'])
  const commission = find(['commission', 'comm', 'fee'])
  const status = find(['status'])
  if (symbol) map.symbol = symbol
  if (side) map.side = side
  if (qty) map.quantity = qty
  if (price) map.price = price
  if (datetime) map.datetime = datetime
  if (commission) map.commission = commission
  if (status) map.status = status
  return map
}

export function buildImportMapping(headers: string[]): Partial<Record<ImportField, string>> {
  const det = detectColumns(headers)
  const norm = headers.map((h) => h.trim().toLowerCase())
  const find = (cands: string[]): string | undefined => {
    for (const c of cands) {
      const i = norm.indexOf(c)
      if (i !== -1) return headers[i]
    }
    return undefined
  }

  const map: Partial<Record<ImportField, string>> = {}
  if (det.symbol) map.symbol = det.symbol
  if (det.direction) map.side = det.direction
  if (det.quantity) map.quantity = det.quantity
  if (det.entryPrice) map.entryPrice = det.entryPrice
  if (det.exitPrice) map.exitPrice = det.exitPrice
  if (det.fees) map.fees = det.fees
  if (det.grossPnl) map.grossPnl = det.grossPnl
  if (det.netPnl) map.netPnl = det.netPnl
  if (det.setupName) map.setupName = det.setupName
  if (det.notes) map.notes = det.notes

  const entryDate =
    find(['open date', 'entry date', 'opened', 'date/time', 'datetime', 'entry datetime']) || det.entryDatetime
  const entryTime = find(['open time', 'entry time'])
  const exitDate = find(['close date', 'exit date', 'closed', 'exit datetime']) || det.exitDatetime
  const exitTime = find(['close time', 'exit time'])
  if (entryDate) map.entryDate = entryDate
  if (entryTime && entryTime !== entryDate) map.entryTime = entryTime
  if (exitDate) map.exitDate = exitDate
  if (exitTime && exitTime !== exitDate) map.exitTime = exitTime

  return map
}
