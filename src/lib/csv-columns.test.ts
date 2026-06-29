import { describe, it, expect } from 'vitest'
import { detectColumns, extractTable, looksLikeFills, buildFillMapping, buildImportMapping } from './csv-columns'

describe('detectColumns', () => {
  it('maps a standard broker header row to canonical fields', () => {
    expect(detectColumns(['Symbol', 'Side', 'Qty', 'Entry Price', 'Exit Price', 'Commission', 'Net P&L'])).toEqual({
      symbol: 'Symbol',
      direction: 'Side',
      quantity: 'Qty',
      entryPrice: 'Entry Price',
      exitPrice: 'Exit Price',
      fees: 'Commission',
      netPnl: 'Net P&L',
    })
  })

  it('is case-insensitive and trims whitespace', () => {
    const m = detectColumns(['  TICKER ', 'qTy'])
    expect(m.symbol).toBe('  TICKER ')
    expect(m.quantity).toBe('qTy')
  })

  it('falls back to generic "price" for entryPrice when no explicit entry column exists', () => {
    expect(detectColumns(['Ticker', 'Price', 'Notes'])).toEqual({
      symbol: 'Ticker',
      entryPrice: 'Price',
      notes: 'Notes',
    })
  })

  it('never maps two fields to the same source column', () => {
    // "Date/Time" matches entryDatetime; it must not also be claimed elsewhere.
    const m = detectColumns(['Symbol', 'Date/Time', 'Price'])
    const used = Object.values(m)
    expect(new Set(used).size).toBe(used.length)
  })

  it('returns an empty mapping when nothing matches', () => {
    expect(detectColumns(['foo', 'bar'])).toEqual({})
  })
})

describe('looksLikeFills', () => {
  it('detects a fills/executions export (side + fill columns)', () => {
    expect(looksLikeFills(['Symbol', 'Buy/Sell', 'Qty Filled', 'Avg Fill Price'])).toBe(true)
  })

  it('rejects a plain trade export without fill columns', () => {
    expect(looksLikeFills(['Symbol', 'Side', 'Price'])).toBe(false)
  })

  it('requires both a side and a fill column', () => {
    expect(looksLikeFills(['Buy/Sell', 'Quantity'])).toBe(false)
    expect(looksLikeFills(['Fill Price', 'Quantity'])).toBe(false)
  })
})

describe('buildFillMapping', () => {
  it('maps every fill field when present', () => {
    expect(
      buildFillMapping([
        'Symbol',
        'Buy/Sell',
        'Qty Filled',
        'Avg Fill Price',
        'Last Fill Time',
        'Commission',
        'Status',
      ]),
    ).toEqual({
      symbol: 'Symbol',
      side: 'Buy/Sell',
      quantity: 'Qty Filled',
      price: 'Avg Fill Price',
      datetime: 'Last Fill Time',
      commission: 'Commission',
      status: 'Status',
    })
  })

  it('omits fields that have no matching header', () => {
    const m = buildFillMapping(['Instrument', 'Side', 'Quantity', 'Price', 'Time'])
    expect(m.symbol).toBe('Instrument')
    expect(m).not.toHaveProperty('commission')
    expect(m).not.toHaveProperty('status')
  })
})

describe('buildImportMapping', () => {
  it('splits combined date columns into separate date/time fields', () => {
    expect(
      buildImportMapping([
        'Symbol',
        'Side',
        'Qty',
        'Entry Price',
        'Exit Price',
        'Open Date',
        'Open Time',
        'Close Date',
        'Close Time',
        'Commission',
        'Net P&L',
      ]),
    ).toEqual({
      symbol: 'Symbol',
      side: 'Side',
      quantity: 'Qty',
      entryPrice: 'Entry Price',
      exitPrice: 'Exit Price',
      entryDate: 'Open Date',
      entryTime: 'Open Time',
      exitDate: 'Close Date',
      exitTime: 'Close Time',
      fees: 'Commission',
      netPnl: 'Net P&L',
    })
  })

  it('does not duplicate a single datetime column as both date and time', () => {
    const m = buildImportMapping(['Symbol', 'Price', 'Date/Time'])
    expect(m.entryDate).toBe('Date/Time')
    expect(m.entryTime).toBeUndefined()
  })
})

describe('extractTable', () => {
  it('skips leading metadata rows and locates the real header', () => {
    const matrix = [
      ['Account: XYZ', '', ''],
      ['Symbol', 'Qty', 'Price', 'Date'],
      ['ES', '2', '5000', '2026-01-05'],
      ['NQ', '1', '18000', '2026-01-06'],
    ]
    const { headers, rows } = extractTable(matrix)
    expect(headers).toEqual(['Symbol', 'Qty', 'Price', 'Date'])
    expect(rows).toEqual([
      { Symbol: 'ES', Qty: '2', Price: '5000', Date: '2026-01-05' },
      { Symbol: 'NQ', Qty: '1', Price: '18000', Date: '2026-01-06' },
    ])
  })

  it('returns empty results for an all-blank matrix', () => {
    expect(
      extractTable([
        ['', ''],
        ['', ''],
      ]),
    ).toEqual({ headers: [], rows: [] })
  })

  it('names blank header cells col1, col2, ...', () => {
    const { headers } = extractTable([
      ['Symbol', '', 'Price'],
      ['ES', 'x', '5000'],
    ])
    expect(headers).toEqual(['Symbol', 'col2', 'Price'])
  })

  it('drops rows whose column count does not match the header', () => {
    const matrix = [
      ['Symbol', 'Qty', 'Price', 'Date'],
      ['ES', '2', '5000', '2026-01-05'],
      ['short', 'row'],
    ]
    const { rows } = extractTable(matrix)
    expect(rows).toHaveLength(1)
  })
})
