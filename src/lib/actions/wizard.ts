'use server'

import { db, accounts, trades, importLogs } from '@/lib/db'
import { and, eq, gte, desc, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { calculatePnl } from '@/lib/utils'
import { roundMoney } from '@/lib/trade-pnl'
import { contractMultiplier } from '@/lib/futures'
import { IMPORT_REQUIRED, FILL_REQUIRED } from '@/lib/csv-columns'
import { t } from '@/i18n'
import { stripTzAbbrev, parseDirection, parseNumber, parseBuySell, parseDateInTz } from './wizard-helpers'
import { uuid } from '@/lib/validation'
import { authedAction, mutationAction, importAction } from '@/lib/safe-action'
import { NotFoundError, ValidationError } from '@/lib/action-errors'

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  assetClass: z.enum(['stocks', 'futures', 'forex', 'crypto', 'options', 'other']),
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

  const mult = v.contractMultiplier && v.contractMultiplier > 0 ? v.contractMultiplier : 1
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
  assetClass: z.enum(['stocks', 'futures', 'forex', 'crypto', 'options', 'other']).default('futures'),
  mapping: z.record(z.string()),
  rows: z.array(z.record(z.string())).min(1).max(10000),
})

export type CsvImportInput = z.infer<typeof csvImportSchema>

export interface WizardImportResult {
  total: number
  imported: number
  skipped: number
  errors: string[]
  unmappedRequired: string[]
}

export const importTradesCsv = importAction([csvImportSchema], async ({ userId }, v): Promise<WizardImportResult> => {
  const account = await assertAccountOwnership(userId, v.accountId)

  const m = v.mapping
  const resolveDate = (row: Record<string, string>, dateField: string, timeField: string) => {
    const dateCol = m[dateField]
    if (!dateCol || !row[dateCol]?.trim()) return null
    const date = stripTzAbbrev(row[dateCol].trim())
    const timeCol = m[timeField]
    const time = timeCol ? stripTzAbbrev(row[timeCol] ?? '') : ''
    return parseDateInTz(time ? `${date} ${time}` : date, v.timezone)
  }

  const unmappedRequired = IMPORT_REQUIRED.filter((f) => !m[f])
  if (unmappedRequired.length > 0) {
    return {
      total: v.rows.length,
      imported: 0,
      skipped: v.rows.length,
      errors: [],
      unmappedRequired: [...unmappedRequired],
    }
  }

  const existing = await db.query.trades.findMany({
    where: and(eq(trades.userId, userId), eq(trades.accountId, v.accountId)),
    columns: { externalId: true },
  })
  const existingIds = new Set(existing.map((t) => t.externalId).filter(Boolean))

  const errors: string[] = []
  let skipped = 0
  const toInsert: (typeof trades.$inferInsert)[] = []

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

      const entryPrice = parseNumber(get('entryPrice'))
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

      const direction = parseDirection(get('side') ?? 'long')
      const externalId = `${symbol.toUpperCase()}_${entryDatetime.toISOString()}_${direction}`
      if (existingIds.has(externalId)) {
        skipped++
        continue
      }

      const exitPrice = parseNumber(get('exitPrice'))
      const quantity = parseNumber(get('quantity')) ?? 1
      const fees = parseNumber(get('fees')) ?? 0
      const exitDatetime = resolveDate(row, 'exitDate', 'exitTime')

      let grossPnl = parseNumber(get('grossPnl'))?.toString() ?? null
      let netPnl = parseNumber(get('netPnl'))?.toString() ?? null
      if (!netPnl && exitPrice !== null) {
        const pnl = calculatePnl(direction, entryPrice, exitPrice, quantity, fees)
        grossPnl = roundMoney(pnl.grossPnl).toString()
        netPnl = roundMoney(pnl.netPnl).toString()
      }

      // Futures detection → asset class + contract multiplier (chart, R-multiple)
      const symUpper = symbol.toUpperCase()
      const mult = contractMultiplier(symUpper)
      const isFutures = mult > 0

      toInsert.push({
        userId,
        accountId: v.accountId,
        symbol: symUpper,
        direction,
        status: exitPrice !== null || netPnl !== null ? 'closed' : 'open',
        assetClass: isFutures ? 'futures' : v.assetClass,
        entryPrice: entryPrice.toString(),
        entryQuantity: quantity.toString(),
        entryDatetime,
        exitPrice: exitPrice?.toString() ?? null,
        exitQuantity: exitPrice !== null ? quantity.toString() : null,
        exitDatetime,
        fees: fees.toString(),
        grossPnl,
        netPnl,
        setupName: get('setupName')?.trim() || null,
        notes: get('notes')?.trim() || null,
        importSource: 'csv',
        externalId,
        extra: isFutures ? { contractMultiplier: mult } : undefined,
      })
      existingIds.add(externalId)
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

  let imported = 0
  const insertedIds: string[] = []
  if (toInsert.length > 0) {
    const chunkSize = 100
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const inserted = await db
        .insert(trades)
        .values(toInsert.slice(i, i + chunkSize))
        .returning({ id: trades.id })
      insertedIds.push(...inserted.map((r) => r.id))
    }
    imported = toInsert.length
  }

  await db.insert(importLogs).values({
    userId,
    accountId: v.accountId,
    filename: v.filename,
    source: 'csv',
    totalRows: v.rows.length,
    importedRows: imported,
    skippedRows: skipped,
    errorRows: errors.length,
    errors: errors.length > 0 ? errors : null,
    tradeIds: insertedIds.length > 0 ? insertedIds : null,
  })

  await db.update(accounts).set({ updatedAt: new Date() }).where(eq(accounts.id, account.id))

  revalidateAll()
  return { total: v.rows.length, imported, skipped, errors, unmappedRequired: [] }
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
    if (tradeIds.length > 0) {
      const deleted = await db
        .delete(trades)
        .where(and(eq(trades.userId, userId), inArray(trades.id, tradeIds)))
        .returning({ id: trades.id })
      deletedTrades = deleted.length
    }

    await db.delete(importLogs).where(and(eq(importLogs.id, id), eq(importLogs.userId, userId)))

    revalidateAll()
    revalidatePath('/settings/import-history')
    return { success: true, deletedTrades }
  },
)

const fillImportSchema = z.object({
  accountId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  timezone: z.string().min(1).max(60),
  mapping: z.record(z.string()),
  rows: z.array(z.record(z.string())).min(1).max(20000),
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
      errors: [],
      unmappedRequired: [...unmappedRequired],
    }
  }
  const get = (row: Record<string, string>, field: string) => (m[field] ? row[m[field]] : undefined)

  const bySymbol = new Map<string, Fill[]>()
  let skipped = 0
  for (const row of v.rows) {
    const status = get(row, 'status')
    if (m.status && status && !status.toLowerCase().includes('fill')) continue
    const symbol = get(row, 'symbol')?.trim().toUpperCase()
    const side = parseBuySell(get(row, 'side'))
    const qty = parseNumber(get(row, 'quantity')) ?? 0
    const price = parseNumber(get(row, 'price')) ?? 0
    const time = parseDateInTz(stripTzAbbrev(get(row, 'datetime') ?? ''), v.timezone)
    const commission = parseNumber(get(row, 'commission')) ?? 0
    if (!symbol || !side || qty <= 0 || price <= 0 || !time) {
      skipped++
      continue
    }
    if (!bySymbol.has(symbol)) bySymbol.set(symbol, [])
    bySymbol.get(symbol)!.push({ side, qty, price, time, commission })
  }

  // dedup
  const existing = await db.query.trades.findMany({
    where: and(eq(trades.userId, userId), eq(trades.accountId, v.accountId)),
    columns: { externalId: true },
  })
  const existingIds = new Set(existing.map((t) => t.externalId).filter(Boolean))

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

    const mult = contractMultiplier(symbol)
    const isFutures = mult > 0
    const m1 = isFutures ? mult : 1
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
    const externalId = `${symbol}_${entryDatetime.toISOString()}_${exitDatetime?.toISOString() ?? 'open'}_${direction}`
    if (existingIds.has(externalId)) return
    existingIds.add(externalId)

    toInsert.push({
      userId,
      accountId: v.accountId,
      symbol,
      direction,
      status,
      assetClass: isFutures ? 'futures' : 'stocks',
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
        contractMultiplier: isFutures ? mult : null,
      },
    })
  }

  for (const [symbol, list] of bySymbol) {
    list.sort((a, b) => a.time.getTime() - b.time.getTime())
    let pos = 0
    let group: Fill[] = []
    for (const f of list) {
      group.push(f)
      pos += f.side === 'buy' ? f.qty : -f.qty
      if (pos === 0) {
        buildTrade(symbol, group)
        group = []
      }
    }
    if (group.length > 0) buildTrade(symbol, group)
  }

  let imported = 0
  const insertedIds: string[] = []
  if (toInsert.length > 0) {
    const chunkSize = 100
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const inserted = await db
        .insert(trades)
        .values(toInsert.slice(i, i + chunkSize))
        .returning({ id: trades.id })
      insertedIds.push(...inserted.map((r) => r.id))
    }
    imported = toInsert.length
  }

  await db.insert(importLogs).values({
    userId,
    accountId: v.accountId,
    filename: v.filename,
    source: 'csv',
    totalRows: v.rows.length,
    importedRows: imported,
    skippedRows: skipped,
    errorRows: 0,
    errors: null,
    tradeIds: insertedIds.length > 0 ? insertedIds : null,
  })
  await db.update(accounts).set({ updatedAt: new Date() }).where(eq(accounts.id, account.id))

  revalidateAll()
  return { total: v.rows.length, imported, skipped, errors: [], unmappedRequired: [] }
})
