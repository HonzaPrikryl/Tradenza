export const CSV_REQUIRED_FIELDS = ['symbol', 'entryPrice', 'entryDatetime'] as const

// ─── Header normalisation ─────────────────────────────────────────────────────
//
// Broker exports spell the same column a dozen ways: "Entry Price",
// "entry_price", "entryPrice", "Entry Price (USD)", "Trade Time(UTC)". Matching
// on the raw string only catches the first. Everything below compares headers
// and candidates through the same normal form, so all of those collapse to the
// same tokens.

export type NormalizedHeader = { raw: string; tokens: string[]; norm: string; squashed: string }

export function normalizeHeader(raw: string): NormalizedHeader {
  const tokens = (raw ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[([{][^)\]}]*[)\]}]/g, ' ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  return { raw, tokens, norm: tokens.join(' '), squashed: tokens.join('') }
}

function containsPhrase(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    if (needle.every((tok, j) => haystack[i + j] === tok)) return true
  }
  return false
}

// Match tiers, strongest first. A tier is exhausted across every field before
// the next one runs, so a precise match ("Exit Price" → exitPrice) always wins
// over a generic one ("price" → entryPrice) no matter the column order.
const TIERS = ['exact', 'squashed', 'phrase', 'token'] as const
type Tier = (typeof TIERS)[number]

function matches(tier: Tier, header: NormalizedHeader, candidate: NormalizedHeader): boolean {
  switch (tier) {
    case 'exact':
      return header.norm === candidate.norm
    case 'squashed':
      return header.squashed === candidate.squashed
    case 'phrase':
      return candidate.tokens.length > 1 && containsPhrase(header.tokens, candidate.tokens)
    case 'token':
      return candidate.tokens.length === 1 && containsPhrase(header.tokens, candidate.tokens)
  }
}

/**
 * Assigns at most one source column to each field. Candidate order is priority;
 * a column claimed by one field is never offered to another.
 */
export function resolveColumns<F extends string>(
  headers: string[],
  candidatesByField: Record<F, string[]>,
): Partial<Record<F, string>> {
  const cols = headers.map(normalizeHeader)
  const fields = Object.entries(candidatesByField) as [F, string[]][]
  const normCandidates = new Map(fields.map(([field, cands]) => [field, cands.map(normalizeHeader)]))

  const result: Partial<Record<F, string>> = {}
  const claimed = new Set<number>()

  for (const tier of TIERS) {
    for (const [field] of fields) {
      if (result[field] !== undefined) continue
      const cands = normCandidates.get(field) ?? []
      outer: for (const cand of cands) {
        for (let i = 0; i < cols.length; i++) {
          if (claimed.has(i) || !matches(tier, cols[i], cand)) continue
          result[field] = headers[i]
          claimed.add(i)
          break outer
        }
      }
    }
  }
  return result
}

// ─── Trade exports ────────────────────────────────────────────────────────────

export const COLUMN_CANDIDATES: Record<string, string[]> = {
  symbol: ['symbol', 'ticker', 'instrument', 'contract', 'trading pair', 'pair', 'market', 'asset', 'coin'],
  direction: [
    'buy/sell',
    'order side',
    'trade side',
    'long/short',
    'side',
    'direction',
    'b/s',
    'type',
    'position',
    'trade type',
    'order type',
  ],
  quantity: [
    'filled quantity',
    'filled qty',
    'exec qty',
    'position size',
    'order quantity',
    'qty',
    'quantity',
    'size',
    'lots',
    'volume',
    'contracts',
    'shares',
    'units',
    'amount',
  ],
  entryPrice: [
    'avg. entry price',
    'avg entry price',
    'average entry price',
    'entry price',
    'open price',
    'opening price',
    'buy price',
    'filled price',
    'order price',
    'avg price',
    'average price',
    'price',
  ],
  exitPrice: [
    'avg. exit price',
    'avg exit price',
    'average exit price',
    'exit price',
    'close price',
    'closing price',
    'sell price',
  ],
  entryDatetime: [
    'entry time',
    'open time',
    'open date',
    'entry date',
    'entry dt',
    'opened',
    'entry datetime',
    'open datetime',
    'trade time',
    'order time',
    'create time',
    'created time',
    'transaction time',
    'execution time',
    'filled time',
    'date/time',
    'datetime',
    'timestamp',
    'time',
    'date',
  ],
  exitDatetime: [
    'exit time',
    'close time',
    'close date',
    'exit date',
    'exit dt',
    'closed',
    'exit datetime',
    'close datetime',
    'closing time',
  ],
  fees: [
    'total fees',
    'trading fee',
    'trade fee',
    'commission paid',
    'fee paid',
    'funding fee',
    'commission',
    'commissions',
    'comm',
    'fees',
    'fee',
  ],
  grossPnl: ['gross p&l', 'gross pnl', 'gross p/l', 'gross profit'],
  netPnl: [
    'net p&l',
    'net pnl',
    'closed p&l',
    'closed pnl',
    'realized p&l',
    'realized pnl',
    'realized profit',
    'net profit',
    'profit/loss',
    'profitloss',
    'pnl',
    'p&l',
    'profit',
  ],
  notes: ['notes', 'note', 'comment', 'comments'],

  // ── Journal & risk ──
  // Broker exports almost never carry these; our own CSV export does, which is
  // what makes a spreadsheet round-trip keep the parts of a trade the trader
  // actually wrote. Candidates are deliberately specific — a loose 'risk' or
  // 'profit' token here would steal a column a broker meant for something else.
  status: ['trade status', 'position status', 'status'],
  exitQuantity: ['exit qty', 'exit quantity', 'closed qty', 'closed quantity', 'close quantity'],
  multiplier: ['contract multiplier', 'point value', 'contract size', 'tick multiplier', 'multiplier', 'mult'],
  stopLoss: ['stop loss', 'stoploss', 'stop price', 'sl'],
  takeProfit: ['take profit', 'takeprofit', 'profit target', 'target price', 'tp'],
  riskAmount: ['risk amount', 'amount at risk', 'risk per trade'],
  riskRewardRatio: ['planned r:r', 'planned rr', 'risk reward ratio', 'risk/reward', 'reward risk', 'r:r', 'rr'],
  rating: ['rating', 'stars', 'grade'],
  setupName: ['setup name', 'setup', 'pattern'],
  strategy: ['strategy', 'playbook'],
  tags: ['tags', 'labels', 'tag', 'label'],
}

export function detectColumns(headers: string[]): Record<string, string> {
  return resolveColumns(headers, COLUMN_CANDIDATES) as Record<string, string>
}

/**
 * Journal and risk fields a trade carries beyond its fills. Optional in every
 * import — a broker export has none of them — but present in our own CSV, which
 * is what lets a spreadsheet round-trip come back with the trade's notes, plan
 * and tags rather than just its numbers.
 */
export const IMPORT_JOURNAL_FIELDS = [
  'status',
  'exitQuantity',
  'multiplier',
  'stopLoss',
  'takeProfit',
  'riskAmount',
  'riskRewardRatio',
  'rating',
  'setupName',
  'strategy',
  'tags',
] as const
export type ImportJournalField = (typeof IMPORT_JOURNAL_FIELDS)[number]

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
  'notes',
  ...IMPORT_JOURNAL_FIELDS,
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

const FILL_CANDIDATES: Record<FillField, string[]> = {
  symbol: ['symbol', 'instrument', 'contract', 'ticker', 'trading pair', 'pair'],
  side: ['buy/sell', 'order side', 'side', 'b/s', 'direction'],
  quantity: ['qty filled', 'filled qty', 'filled quantity', 'exec qty', 'quantity', 'qty', 'amount', 'size'],
  price: ['avg fill price', 'average fill price', 'fill price', 'filled price', 'exec price', 'avg price', 'price'],
  datetime: [
    'last fill time',
    'fill time',
    'update time',
    'create time',
    'transaction time',
    'execution time',
    'order time',
    'trade time',
    'date/time',
    'datetime',
    'timestamp',
    'time',
  ],
  commission: ['trading fee', 'trade fee', 'commission', 'commissions', 'comm', 'fees', 'fee'],
  status: ['order status', 'status'],
}

const SIDE_HINTS = ['buy/sell', 'side', 'b/s', 'order side'].map(normalizeHeader)
const FILL_HINTS = ['qty filled', 'filled qty', 'avg fill price', 'fill price', 'filled price', 'exec qty'].map(
  normalizeHeader,
)

export function looksLikeFills(headers: string[]): boolean {
  const cols = headers.map(normalizeHeader)
  const has = (hints: NormalizedHeader[]) =>
    cols.some((col) => hints.some((h) => col.norm === h.norm || containsPhrase(col.tokens, h.tokens)))
  return has(SIDE_HINTS) && has(FILL_HINTS)
}

export function buildFillMapping(headers: string[]): Partial<Record<FillField, string>> {
  return resolveColumns(headers, FILL_CANDIDATES)
}

const DATE_CANDIDATES: Record<'entryDate' | 'entryTime' | 'exitDate' | 'exitTime', string[]> = {
  entryDate: [
    'open date',
    'entry date',
    'entry dt',
    'opened',
    'entry datetime',
    'open datetime',
    'trade time',
    'order time',
    'create time',
    'created time',
    'transaction time',
    'date/time',
    'datetime',
    'timestamp',
  ],
  entryTime: ['open time', 'entry time'],
  exitDate: ['close date', 'exit date', 'exit dt', 'closed', 'exit datetime', 'close datetime'],
  exitTime: ['close time', 'exit time'],
}

export function buildImportMapping(headers: string[]): Partial<Record<ImportField, string>> {
  const det = detectColumns(headers)
  const dates = resolveColumns(headers, DATE_CANDIDATES)

  const map: Partial<Record<ImportField, string>> = {}
  if (det.symbol) map.symbol = det.symbol
  if (det.direction) map.side = det.direction
  if (det.quantity) map.quantity = det.quantity
  if (det.entryPrice) map.entryPrice = det.entryPrice
  if (det.exitPrice) map.exitPrice = det.exitPrice
  if (det.fees) map.fees = det.fees
  if (det.grossPnl) map.grossPnl = det.grossPnl
  if (det.netPnl) map.netPnl = det.netPnl
  if (det.notes) map.notes = det.notes
  for (const field of IMPORT_JOURNAL_FIELDS) {
    if (det[field]) map[field] = det[field]
  }

  const entryDate = dates.entryDate ?? det.entryDatetime
  const exitDate = dates.exitDate ?? det.exitDatetime
  if (entryDate) map.entryDate = entryDate
  if (dates.entryTime && dates.entryTime !== entryDate) map.entryTime = dates.entryTime
  if (exitDate && exitDate !== entryDate) map.exitDate = exitDate
  if (dates.exitTime && dates.exitTime !== exitDate) map.exitTime = dates.exitTime

  return map
}

/**
 * Fields that carry no source column after auto-mapping. Powers the funnel event
 * that tells us which broker formats the smart mapper still fails on.
 */
export function unmappedRequiredFields(
  mapping: Partial<Record<string, string>>,
  required: readonly string[],
): string[] {
  return required.filter((f) => !mapping[f])
}
