'use server'

import { db, accounts, trades, importLogs } from '@/lib/db'
import { and, eq, gte, desc, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { calculatePnl } from '@/lib/utils'
import { roundMoney } from '@/lib/trade-pnl'
import { contractMultiplier, assetMultiplier } from '@/lib/futures'
import { IMPORT_REQUIRED, FILL_REQUIRED } from '@/lib/csv-columns'
import { t } from '@/i18n'
import {
  stripTzAbbrev,
  resolveSideAndQuantity,
  parseNumber,
  parseBuySell,
  parseDateInTz,
  mergeRoundTripPartials,
  detectDecimalSeparator,
  detectDayFirst,
  isFlat,
  MAX_TRADE_ROWS,
  MAX_FILL_ROWS,
  type RoundTripLeg,
} from './wizard-helpers'
import { uuid } from '@/lib/validation'
import { runAtomic } from '@/lib/db/atomic'
import { cleanupOrphanedImages, tradeImageKeys } from '@/lib/orphan-images'
import { authedAction, mutationAction, importAction } from '@/lib/safe-action'
import { NotFoundError, ValidationError } from '@/lib/action-errors'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// How many rows to sample when inferring a file-wide convention ("1,5" vs "1.5",
// "16/06" vs "06/16"). A file uses one throughout, so the head is representative.
const FORMAT_SAMPLE_ROWS = 200

/** Every value the given fields contribute, pooled across their mapped columns. */
function sampleColumnValues(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  fields: readonly string[],
): (string | undefined)[] {
  const sample = rows.slice(0, FORMAT_SAMPLE_ROWS)
  const values: (string | undefined)[] = []
  for (const field of fields) {
    const col = mapping[field]
    if (!col) continue
    for (const row of sample) values.push(row[col])
  }
  return values
}

/**
 * The decimal separator for the whole file, pooled from every mapped numeric
 * column. Per-file rather than per-column: one export never mixes conventions,
 * and pooling the evidence settles a column of otherwise round numbers.
 */
function fileDecimalSeparator(
  rows: Record<string, string>[],
  mapping: Record<string, string>,
  numericFields: readonly string[],
) {
  return detectDecimalSeparator(sampleColumnValues(rows, mapping, numericFields))
}

/** Whether slash dates in this file are day-first (16/06) or month-first (06/16). */
function fileDayFirst(rows: Record<string, string>[], mapping: Record<string, string>, dateFields: readonly string[]) {
  return detectDayFirst(sampleColumnValues(rows, mapping, dateFields))
}

/**
 * Which of these external ids already exist in the account.
 *
 * Asks only about the ids the file actually produced, rather than reading every
 * trade in the account on every import — a scalper with 50k trades paid for all
 * of them to check a 200-row file. Hits `trades_external_id_idx`, chunked so the
 * IN list stays inside the parameter limit.
 */
async function existingExternalIds(userId: string, accountId: string, candidates: string[]): Promise<Set<string>> {
  const found = new Set<string>()
  const unique = [...new Set(candidates)]
  const CHUNK = 500
  for (let i = 0; i < unique.length; i += CHUNK) {
    const rows = await db
      .select({ externalId: trades.externalId })
      .from(trades)
      .where(
        and(
          eq(trades.userId, userId),
          eq(trades.accountId, accountId),
          inArray(trades.externalId, unique.slice(i, i + CHUNK)),
        ),
      )
    for (const r of rows) if (r.externalId) found.add(r.externalId)
  }
  return found
}

/**
 * Insert the parsed trades and record the import.
 *
 * The log is written in a `finally`, so a batch that dies halfway still leaves an
 * import-history entry covering the rows that did land. Without it those trades
 * existed with nothing pointing at them and could never be rolled back. Neither
 * supported driver gives us a transaction spanning a variable number of
 * statements, so this is the guarantee we can actually make.
 */
async function commitImport(args: {
  userId: string
  accountId: string
  filename: string
  toInsert: (typeof trades.$inferInsert)[]
  totalRows: number
  skippedRows: number
  errors: string[]
}): Promise<number> {
  const insertedIds: string[] = []
  const CHUNK = 100
  try {
    for (let i = 0; i < args.toInsert.length; i += CHUNK) {
      const inserted = await db
        .insert(trades)
        .values(args.toInsert.slice(i, i + CHUNK))
        .returning({ id: trades.id })
      insertedIds.push(...inserted.map((r) => r.id))
    }
  } finally {
    try {
      await db.insert(importLogs).values({
        userId: args.userId,
        accountId: args.accountId,
        filename: args.filename,
        source: 'csv',
        totalRows: args.totalRows,
        importedRows: insertedIds.length,
        skippedRows: args.skippedRows,
        errorRows: args.errors.length,
        errors: args.errors.length > 0 ? args.errors : null,
        tradeIds: insertedIds.length > 0 ? insertedIds : null,
      })
      await db.update(accounts).set({ updatedAt: new Date() }).where(eq(accounts.id, args.accountId))
    } catch {
      // Never let bookkeeping mask the insert failure it is reporting on.
    }
  }
  return insertedIds.length
}

async function assertAccountOwnership(userId: string, accountId: string) {
  const acc = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, accountId), eq(accounts.userId, userId)),
  })
  if (!acc) throw new NotFoundError(t('validation.wizard.accountNotFound'))
  return acc
}

function revalidateAll() {
  revalidatePath('/dashboard')
  revalidatePath('/trades')
  revalidatePath('/add-trade')
  revalidatePath('/accounts')
}

const executionSchema = z.object({
  datetime: z.string().min(1),
  side: z.enum(['buy', 'sell']),
  quantity: z.coerce.number().positive(),
  price: z.coerce.number().positive(),
  commission: z.coerce.number().min(0).default(0),
  fee: z.coerce.number().min(0).default(0),
})

const manualTradeSchema = z.object({
  accountId: z.string().uuid(),
  assetClass: z.enum(['stocks', 'futures', 'forex', 'crypto', 'options', 'cfd', 'other']),
  symbol: z.string().trim().min(1).max(20),
  contractMultiplier: z.coerce.number().min(0).optional(),
  // Contract expiration date ("YYYY-MM-DD"), informational only.
  expirationDate: z.string().optional(),
  executions: z.array(executionSchema).min(1),
})

export type ManualTradeInput = z.infer<typeof manualTradeSchema>

export const saveManualTrade = mutationAction([manualTradeSchema], async ({ userId }, v) => {
  await assertAccountOwnership(userId, v.accountId)

  const execs = [...v.executions].sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime())

  for (const e of execs) {
    if (isNaN(new Date(e.datetime).getTime())) {
      throw new ValidationError(t('validation.wizard.invalidExecutionDate'))
    }
  }

  const direction: 'long' | 'short' = execs[0].side === 'buy' ? 'long' : 'short'
  const entrySide = execs[0].side
  const entries = execs.filter((e) => e.side === entrySide)
  const exits = execs.filter((e) => e.side !== entrySide)

  const sumQty = (rows: typeof execs) => rows.reduce((s, e) => s + e.quantity, 0)
  const avgPrice = (rows: typeof execs) => {
    const qty = sumQty(rows)
    return qty === 0 ? 0 : rows.reduce((s, e) => s + e.price * e.quantity, 0) / qty
  }

  const entryQuantity = sumQty(entries)
  const exitQuantity = sumQty(exits)
  const entryPrice = avgPrice(entries)
  const exitPrice = exits.length > 0 ? avgPrice(exits) : null
  const fees = execs.reduce((s, e) => s + e.commission + e.fee, 0)

  const entryDatetime = new Date(entries[0].datetime)
  const exitDatetime = exits.length > 0 ? new Date(exits[exits.length - 1].datetime) : null

  // An explicit per-execution multiplier wins; otherwise fall back to the shared
  // rule rather than to 1. Falling back to 1 priced a manually entered options or
  // forex trade as if it were a stock whenever the field was cleared.
  const mult =
    v.contractMultiplier && v.contractMultiplier > 0 ? v.contractMultiplier : assetMultiplier(v.assetClass, v.symbol)
  let grossPnl: string | null = null
  let netPnl: string | null = null
  const matchedQty = Math.min(entryQuantity, exitQuantity)
  if (exitPrice !== null && matchedQty > 0) {
    const pnl = calculatePnl(direction, entryPrice, exitPrice, matchedQty, 0)
    const gross = pnl.grossPnl * mult
    grossPnl = roundMoney(gross).toString()
    netPnl = roundMoney(gross - fees).toString()
  }

  const status: 'open' | 'closed' = exitQuantity >= entryQuantity && exits.length > 0 ? 'closed' : 'open'

  const [trade] = await db
    .insert(trades)
    .values({
      userId,
      accountId: v.accountId,
      symbol: v.symbol.toUpperCase(),
      direction,
      status,
      assetClass: v.assetClass,
      entryPrice: entryPrice.toString(),
      entryQuantity: entryQuantity.toString(),
      entryDatetime,
      exitPrice: exitPrice?.toString() ?? null,
      exitQuantity: exitQuantity > 0 ? exitQuantity.toString() : null,
      exitDatetime,
      fees: fees.toString(),
      grossPnl,
      netPnl,
      importSource: 'manual',
      extra: {
        executions: execs,
        contractMultiplier: v.contractMultiplier ?? null,
        expirationDate: v.expirationDate ?? null,
      },
    })
    .returning()

  await db.update(accounts).set({ updatedAt: new Date() }).where(eq(accounts.id, v.accountId))

  revalidateAll()
  return { success: true, tradeId: trade.id }
})

const csvImportSchema = z.object({
  accountId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  timezone: z.string().min(1).max(60),
  assetClass: z.enum(['stocks', 'futures', 'forex', 'crypto', 'options', 'cfd', 'other']).default('futures'),
  mapping: z.record(z.string()),
  rows: z.array(z.record(z.string())).min(1).max(MAX_TRADE_ROWS),
})

export type CsvImportInput = z.infer<typeof csvImportSchema>

export interface WizardImportResult {
  total: number
  imported: number
  /** Rows we could not read — a real problem worth showing the user. */
  skipped: number
  /** Rows that matched a trade already in the account. Expected, not a failure. */
  duplicates: number
  errors: string[]
  unmappedRequired: string[]
}

export const importTradesCsv = importAction([csvImportSchema], async ({ userId }, v): Promise<WizardImportResult> => {
  const account = await assertAccountOwnership(userId, v.accountId)

  const m = v.mapping
  const dayFirst = fileDayFirst(v.rows, m, ['entryDate', 'exitDate'])
  const resolveDate = (row: Record<string, string>, dateField: string, timeField: string) => {
    const dateCol = m[dateField]
    if (!dateCol || !row[dateCol]?.trim()) return null
    const date = stripTzAbbrev(row[dateCol].trim())
    const timeCol = m[timeField]
    const time = timeCol ? stripTzAbbrev(row[timeCol] ?? '') : ''
    return parseDateInTz(time ? `${date} ${time}` : date, v.timezone, dayFirst)
  }

  const unmappedRequired = IMPORT_REQUIRED.filter((f) => !m[f])
  if (unmappedRequired.length > 0) {
    return {
      total: v.rows.length,
      imported: 0,
      skipped: v.rows.length,
      duplicates: 0,
      errors: [],
      unmappedRequired: [...unmappedRequired],
    }
  }

  const decimal = fileDecimalSeparator(v.rows, m, ['entryPrice', 'exitPrice', 'quantity', 'fees', 'grossPnl', 'netPnl'])

  const errors: string[] = []
  let skipped = 0
  let duplicates = 0
  // Rows where a side column was mapped but held something we don't understand
  // (typically an "Order Type" column). Direction fell back to the quantity sign,
  // which is a guess — worth telling the user rather than silently accepting.
  let unreadableSide = 0
  const toInsert: (typeof trades.$inferInsert)[] = []

  // Phase 1 — parse each valid row into a normalized round-trip leg. One CSV row
  // is one exit fill; several rows can share a single position (partials).
  const legs: RoundTripLeg[] = []
  for (let i = 0; i < v.rows.length; i++) {
    const row = v.rows[i]
    const rowNum = i + 2
    const get = (field: string) => (m[field] ? row[m[field]] : undefined)

    try {
      const symbol = get('symbol')?.trim()
      if (!symbol) {
        errors.push(t('validation.import.missingSymbol', { row: rowNum }))
        skipped++
        continue
      }

      const entryPrice = parseNumber(get('entryPrice'), decimal)
      if (entryPrice === null) {
        errors.push(t('validation.import.invalidEntryPrice', { row: rowNum }))
        skipped++
        continue
      }

      const entryDatetime = resolveDate(row, 'entryDate', 'entryTime')
      if (!entryDatetime) {
        errors.push(t('validation.import.invalidEntryDate', { row: rowNum }))
        skipped++
        continue
      }

      // Direction + size. A mapped `side` column wins; otherwise the direction is
      // inferred from the sign of the quantity (e.g. DeepCharts encodes short as a
      // negative quantity and ships no side column). Quantity is always positive.
      const { direction, quantity, sideUnreadable } = resolveSideAndQuantity(
        get('side'),
        parseNumber(get('quantity'), decimal),
      )
      if (sideUnreadable) unreadableSide++
      if (quantity <= 0) {
        errors.push(t('validation.import.invalidQuantity', { row: rowNum }))
        skipped++
        continue
      }
      const exitPrice = parseNumber(get('exitPrice'), decimal)
      const exitDatetime = resolveDate(row, 'exitDate', 'exitTime')

      legs.push({
        symbol: symbol.toUpperCase(),
        direction,
        entryDatetime,
        entryPrice,
        exitDatetime: exitPrice !== null ? exitDatetime : null,
        exitPrice,
        quantity,
        // Brokers disagree on the sign of a cost: some export commissions as
        // negative. Taking it at face value would *increase* net P&L.
        fees: Math.abs(parseNumber(get('fees'), decimal) ?? 0),
        grossPnl: parseNumber(get('grossPnl'), decimal),
        netPnl: parseNumber(get('netPnl'), decimal),
        notes: get('notes')?.trim() || null,
      })
    } catch (err) {
      errors.push(
        t('validation.import.unknownError', {
          row: rowNum,
          error: err instanceof Error ? err.message : t('validation.import.unknownErrorShort'),
        }),
      )
      skipped++
    }
  }

  if (unreadableSide > 0) errors.push(t('validation.import.sideUnreadable', { count: unreadableSide }))

  // Phase 2 — merge partials that share a position (same symbol/direction/entry)
  // into one trade, then build the insert rows. Non-partial rows merge to a group
  // of one, so single round-trip exports are unchanged.
  const merged = mergeRoundTripPartials(legs)
  const tradeExternalId = (x: (typeof merged)[number]) => `${x.symbol}_${x.entryDatetime.toISOString()}_${x.direction}`
  const existingIds = await existingExternalIds(userId, v.accountId, merged.map(tradeExternalId))

  for (const trade of merged) {
    const externalId = tradeExternalId(trade)
    if (existingIds.has(externalId)) {
      duplicates += trade.legCount
      continue
    }

    // Resolve asset class: a symbol matching a known futures contract is always
    // futures (overrides the picker); otherwise honour the asset class chosen for
    // this import, constrained to what the broker supports.
    const resolvedAssetClass = contractMultiplier(trade.symbol) > 0 ? 'futures' : v.assetClass
    // Per-point value multiplier: futures → contract size, options → 100, else 1.
    const mult = assetMultiplier(resolvedAssetClass, trade.symbol)

    // A row-per-exit export gives each leg both its entry and its exit size, so
    // comparing the two totals is what tells a fully closed position from one
    // that still has size on. Exports that ship no exit quantity at all fall back
    // to "an exit price or a P&L means it's done".
    const fullyExited =
      trade.exitQuantity > 0
        ? trade.exitQuantity >= trade.entryQuantity
        : trade.exitPrice !== null || trade.netPnl !== null

    // Prefer the broker-provided P&L (summed across partials); only compute from
    // prices when none was supplied — applying the instrument multiplier so
    // futures/options round-trips without a P&L column are still valued correctly.
    let grossPnl = trade.grossPnl !== null ? roundMoney(trade.grossPnl).toString() : null
    let netPnl = trade.netPnl !== null ? roundMoney(trade.netPnl).toString() : null
    if (netPnl === null && trade.exitPrice !== null) {
      const matched = Math.min(trade.entryQuantity, trade.exitQuantity)
      const pnl = calculatePnl(trade.direction, trade.entryPrice, trade.exitPrice, matched, 0)
      const gross = pnl.grossPnl * mult
      grossPnl = roundMoney(gross).toString()
      netPnl = roundMoney(gross - trade.fees).toString()
    }

    // Persist the individual fills only when a position was actually scaled
    // (more than one leg); persist the multiplier only for derivatives (≠ 1) so
    // single round-trip stock/forex trades keep a minimal `extra`.
    const hasPartials = trade.legCount > 1
    const hasMult = mult !== 1
    const extra =
      hasMult || hasPartials
        ? {
            ...(hasMult ? { contractMultiplier: mult } : {}),
            ...(hasPartials ? { executions: trade.executions } : {}),
          }
        : undefined

    toInsert.push({
      userId,
      accountId: v.accountId,
      symbol: trade.symbol,
      direction: trade.direction,
      // Closed only once the exits cover the entries. A position whose partials
      // are still open in the export used to be filed as closed just because one
      // of its legs carried an exit price.
      status: fullyExited ? 'closed' : 'open',
      assetClass: resolvedAssetClass,
      entryPrice: trade.entryPrice.toString(),
      entryQuantity: trade.entryQuantity.toString(),
      entryDatetime: trade.entryDatetime,
      exitPrice: trade.exitPrice?.toString() ?? null,
      exitQuantity: trade.exitQuantity > 0 ? trade.exitQuantity.toString() : null,
      exitDatetime: trade.exitDatetime,
      fees: trade.fees.toString(),
      grossPnl,
      netPnl,
      notes: trade.notes,
      importSource: 'csv',
      externalId,
      extra,
    })
    existingIds.add(externalId)
  }

  const imported = await commitImport({
    userId,
    accountId: account.id,
    filename: v.filename,
    toInsert,
    totalRows: v.rows.length,
    skippedRows: skipped + duplicates,
    errors,
  })

  revalidateAll()
  return { total: v.rows.length, imported, skipped, duplicates, errors, unmappedRequired: [] }
})

export interface ImportHistoryRow {
  id: string
  accountName: string | null
  broker: string | null
  filename: string
  uploadDate: string
  transactions: number
  trades: number
  status: 'completed' | 'partial' | 'failed'
}

export const getImportHistory = authedAction([], async ({ userId }): Promise<ImportHistoryRow[]> => {
  const since = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      id: importLogs.id,
      filename: importLogs.filename,
      totalRows: importLogs.totalRows,
      importedRows: importLogs.importedRows,
      errorRows: importLogs.errorRows,
      createdAt: importLogs.createdAt,
      accountName: accounts.name,
      broker: accounts.broker,
    })
    .from(importLogs)
    .leftJoin(accounts, eq(importLogs.accountId, accounts.id))
    .where(and(eq(importLogs.userId, userId), gte(importLogs.createdAt, since)))
    .orderBy(desc(importLogs.createdAt))

  return rows.map((r) => ({
    id: r.id,
    accountName: r.accountName ?? null,
    broker: r.broker ?? null,
    filename: r.filename,
    uploadDate: r.createdAt.toISOString(),
    transactions: r.totalRows,
    trades: r.importedRows,
    status: r.importedRows === 0 ? 'failed' : r.errorRows > 0 ? 'partial' : 'completed',
  }))
})

export const deleteImport = mutationAction(
  [uuid],
  async ({ userId }, id): Promise<{ success: true; deletedTrades: number }> => {
    const log = await db.query.importLogs.findFirst({
      where: and(eq(importLogs.id, id), eq(importLogs.userId, userId)),
    })
    if (!log) throw new NotFoundError(t('validation.import.logNotFound'))

    const tradeIds = Array.isArray(log.tradeIds) ? (log.tradeIds as string[]) : []

    let deletedTrades = 0
    if (tradeIds.length === 0) {
      await db.delete(importLogs).where(and(eq(importLogs.id, id), eq(importLogs.userId, userId)))
    } else {
      const keys = await tradeImageKeys(userId, inArray(trades.id, tradeIds))
      const [removed] = await runAtomic((x) => [
        x
          .delete(trades)
          .where(and(eq(trades.userId, userId), inArray(trades.id, tradeIds)))
          .returning({ id: trades.id }),
        x.delete(importLogs).where(and(eq(importLogs.id, id), eq(importLogs.userId, userId))),
      ])
      deletedTrades = removed.length

      await cleanupOrphanedImages(userId, keys)
    }

    revalidateAll()
    revalidatePath('/settings/import-history')
    return { success: true, deletedTrades }
  },
)

const fillImportSchema = z.object({
  accountId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  timezone: z.string().min(1).max(60),
  assetClass: z.enum(['stocks', 'futures', 'forex', 'crypto', 'options', 'cfd', 'other']).default('stocks'),
  mapping: z.record(z.string()),
  rows: z.array(z.record(z.string())).min(1).max(MAX_FILL_ROWS),
})
export type FillImportInput = z.infer<typeof fillImportSchema>

interface Fill {
  side: 'buy' | 'sell'
  qty: number
  price: number
  time: Date
  commission: number
}

export const importFillsCsv = importAction([fillImportSchema], async ({ userId }, v): Promise<WizardImportResult> => {
  const account = await assertAccountOwnership(userId, v.accountId)

  const m = v.mapping
  const unmappedRequired = FILL_REQUIRED.filter((f) => !m[f])
  if (unmappedRequired.length > 0) {
    return {
      total: v.rows.length,
      imported: 0,
      skipped: v.rows.length,
      duplicates: 0,
      errors: [],
      unmappedRequired: [...unmappedRequired],
    }
  }
  const get = (row: Record<string, string>, field: string) => (m[field] ? row[m[field]] : undefined)
  const decimal = fileDecimalSeparator(v.rows, m, ['price', 'quantity', 'commission'])
  const dayFirst = fileDayFirst(v.rows, m, ['datetime'])

  const bySymbol = new Map<string, Fill[]>()
  let skipped = 0
  let duplicates = 0
  for (const row of v.rows) {
    const status = get(row, 'status')
    // Cancelled / rejected orders are not fills. They still have to land in a
    // counter, or "N rows processed" stops adding up and the result looks like
    // rows vanished.
    if (m.status && status && !status.toLowerCase().includes('fill')) {
      skipped++
      continue
    }
    const symbol = get(row, 'symbol')?.trim().toUpperCase()
    const side = parseBuySell(get(row, 'side'))
    const qty = parseNumber(get(row, 'quantity'), decimal) ?? 0
    const price = parseNumber(get(row, 'price'), decimal) ?? 0
    const time = parseDateInTz(stripTzAbbrev(get(row, 'datetime') ?? ''), v.timezone, dayFirst)
    const commission = Math.abs(parseNumber(get(row, 'commission'), decimal) ?? 0)
    if (!symbol || !side || qty <= 0 || price <= 0 || !time) {
      skipped++
      continue
    }
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, [])
    bySymbol.get(symbol)!.push({ side, qty, price, time, commission })
  }

  // Walk each symbol's fills in time order, cutting a round trip every time the
  // running position returns to flat. Grouping happens before the dedup query so
  // we can ask the database only about the ids this file actually produces.
  const groups: { symbol: string; fills: Fill[] }[] = []
  for (const [symbol, list] of bySymbol) {
    list.sort((a, b) => a.time.getTime() - b.time.getTime())
    let pos = 0
    let group: Fill[] = []
    for (const f of list) {
      group.push(f)
      pos += f.side === 'buy' ? f.qty : -f.qty
      // Tolerance, not equality: fractional crypto/forex sizes never sum back to
      // an exact 0, which used to fold a whole symbol into a single trade.
      if (isFlat(pos)) {
        groups.push({ symbol, fills: group })
        group = []
        pos = 0
      }
    }
    if (group.length > 0) groups.push({ symbol, fills: group })
  }

  const fillExternalId = ({ symbol, fills }: { symbol: string; fills: Fill[] }) => {
    const direction = fills[0].side === 'buy' ? 'long' : 'short'
    const exits = fills.filter((f) => f.side !== fills[0].side)
    const exitDatetime = exits.length > 0 ? fills[fills.length - 1].time : null
    return `${symbol}_${fills[0].time.toISOString()}_${exitDatetime?.toISOString() ?? 'open'}_${direction}`
  }

  const existingIds = await existingExternalIds(userId, v.accountId, groups.map(fillExternalId))

  const toInsert: (typeof trades.$inferInsert)[] = []

  const buildTrade = (symbol: string, group: Fill[]) => {
    const entrySide = group[0].side
    const direction: 'long' | 'short' = entrySide === 'buy' ? 'long' : 'short'
    const entries = group.filter((f) => f.side === entrySide)
    const exits = group.filter((f) => f.side !== entrySide)
    const sumQty = (rows: Fill[]) => rows.reduce((s, f) => s + f.qty, 0)
    const avg = (rows: Fill[]) => {
      const q = sumQty(rows)
      return q === 0 ? 0 : rows.reduce((s, f) => s + f.price * f.qty, 0) / q
    }
    const entryQty = sumQty(entries)
    const exitQty = sumQty(exits)
    const entryPrice = avg(entries)
    const exitPrice = exits.length > 0 ? avg(exits) : null
    const fees = group.reduce((s, f) => s + f.commission, 0)
    const entryDatetime = group[0].time
    const exitDatetime = exits.length > 0 ? group[group.length - 1].time : null

    // Known futures symbols override the picker; otherwise use the chosen class.
    const resolvedAssetClass = contractMultiplier(symbol) > 0 ? 'futures' : v.assetClass
    const m1 = assetMultiplier(resolvedAssetClass, symbol)
    let grossPnl: string | null = null
    let netPnl: string | null = null
    const matched = Math.min(entryQty, exitQty)
    if (exitPrice !== null && matched > 0) {
      const pnl = calculatePnl(direction, entryPrice, exitPrice, matched, 0)
      const gross = pnl.grossPnl * m1
      grossPnl = roundMoney(gross).toString()
      netPnl = roundMoney(gross - fees).toString()
    }
    const status: 'open' | 'closed' = exitQty >= entryQty && exits.length > 0 ? 'closed' : 'open'
    const externalId = fillExternalId({ symbol, fills: group })
    if (existingIds.has(externalId)) {
      duplicates += group.length
      return
    }
    existingIds.add(externalId)

    toInsert.push({
      userId,
      accountId: v.accountId,
      symbol,
      direction,
      status,
      assetClass: resolvedAssetClass,
      entryPrice: entryPrice.toString(),
      entryQuantity: entryQty.toString(),
      entryDatetime,
      exitPrice: exitPrice?.toString() ?? null,
      exitQuantity: exitQty > 0 ? exitQty.toString() : null,
      exitDatetime,
      fees: fees.toString(),
      grossPnl,
      netPnl,
      importSource: 'csv',
      externalId,
      extra: {
        executions: group.map((f) => ({
          datetime: f.time.toISOString(),
          side: f.side,
          quantity: f.qty,
          price: f.price,
          commission: f.commission,
          fee: 0,
        })),
        contractMultiplier: m1 !== 1 ? m1 : null,
      },
    })
  }

  for (const g of groups) buildTrade(g.symbol, g.fills)

  const imported = await commitImport({
    userId,
    accountId: account.id,
    filename: v.filename,
    toInsert,
    totalRows: v.rows.length,
    skippedRows: skipped + duplicates,
    errors: [],
  })

  revalidateAll()
  return { total: v.rows.length, imported, skipped, duplicates, errors: [], unmappedRequired: [] }
})
