import { describe, it, expect } from 'vitest'
import {
  detectColumns,
  extractTable,
  looksLikeFills,
  buildFillMapping,
  buildImportMapping,
  normalizeHeader,
  unmappedRequiredFields,
  IMPORT_REQUIRED,
} from './csv-columns'

describe('normalizeHeader', () => {
  it('strips unit and timezone suffixes', () => {
    expect(normalizeHeader('Entry Price (USD)').norm).toBe('entry price')
    expect(normalizeHeader('Trade Time(UTC)').norm).toBe('trade time')
  })

  it('treats separator styles as equivalent', () => {
    const forms = ['Entry Price', 'entry_price', 'entry-price', 'ENTRY.PRICE', 'entryPrice']
    expect(new Set(forms.map((f) => normalizeHeader(f).squashed)).size).toBe(1)
  })

  it('splits camelCase into tokens', () => {
    expect(normalizeHeader('ProfitLoss').tokens).toEqual(['profit', 'loss'])
  })

  it('drops punctuation that varies between exports', () => {
    expect(normalizeHeader('Net P&L').norm).toBe(normalizeHeader('net p/l').norm)
    expect(normalizeHeader('B/S').norm).toBe('b s')
  })
})

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

  it('matches headers carrying unit or timezone suffixes', () => {
    const m = detectColumns(['Symbol', 'Entry Price (USD)', 'Exit Price (USD)', 'Trade Time(UTC)'])
    expect(m.entryPrice).toBe('Entry Price (USD)')
    expect(m.exitPrice).toBe('Exit Price (USD)')
    expect(m.entryDatetime).toBe('Trade Time(UTC)')
  })

  it('matches snake_case and camelCase headers', () => {
    expect(detectColumns(['symbol', 'entry_price', 'exit_price', 'net_pnl'])).toMatchObject({
      entryPrice: 'entry_price',
      exitPrice: 'exit_price',
      netPnl: 'net_pnl',
    })
    expect(detectColumns(['symbol', 'entryPrice', 'exitPrice', 'netPnl'])).toMatchObject({
      entryPrice: 'entryPrice',
      exitPrice: 'exitPrice',
      netPnl: 'netPnl',
    })
  })

  it('never lets a generic candidate steal a column an exact match owns', () => {
    // "price" is a valid entryPrice fallback, but only once no field claims the
    // column outright — otherwise a sell-only export maps its exit as an entry.
    const m = detectColumns(['Ticker', 'Exit Price', 'Close Time'])
    expect(m.exitPrice).toBe('Exit Price')
    expect(m.entryPrice).toBeUndefined()
  })

  it('requires whole-token matches, so "comm" does not claim "Comments"', () => {
    const m = detectColumns(['Symbol', 'Comments'])
    expect(m.notes).toBe('Comments')
    expect(m.fees).toBeUndefined()
  })

  it('maps a Binance-style export', () => {
    expect(
      detectColumns(['Pair', 'Side', 'Executed Qty', 'Filled Price', 'Realized Profit', 'Fee', 'Date(UTC)']),
    ).toEqual({
      symbol: 'Pair',
      direction: 'Side',
      quantity: 'Executed Qty',
      entryPrice: 'Filled Price',
      netPnl: 'Realized Profit',
      fees: 'Fee',
      entryDatetime: 'Date(UTC)',
    })
  })

  it('maps a Bybit closed-P&L export', () => {
    const m = detectColumns(['Closing Direction', 'Qty', 'Entry Price', 'Exit Price', 'Closed P&L', 'Trade Time(UTC)'])
    expect(m).toMatchObject({
      direction: 'Closing Direction',
      quantity: 'Qty',
      entryPrice: 'Entry Price',
      exitPrice: 'Exit Price',
      netPnl: 'Closed P&L',
      entryDatetime: 'Trade Time(UTC)',
    })
  })
})

describe('unmappedRequiredFields', () => {
  it('lists the required fields the auto-mapper could not fill', () => {
    const m = buildImportMapping(['Instrument', 'Some Vendor Column'])
    expect(unmappedRequiredFields(m, IMPORT_REQUIRED)).toEqual(['entryPrice', 'entryDate'])
  })

  it('returns nothing when every required field is mapped', () => {
    const m = buildImportMapping(['Symbol', 'Entry Price', 'Entry Date'])
    expect(unmappedRequiredFields(m, IMPORT_REQUIRED)).toEqual([])
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

  it('detects fills through separator and suffix noise', () => {
    expect(looksLikeFills(['symbol', 'order_side', 'filled_qty', 'avg_fill_price (USD)'])).toBe(true)
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

  it('maps plural and suffixed fee headers', () => {
    expect(buildFillMapping(['Symbol', 'Side', 'Qty', 'Price', 'Time', 'Fees (USD)']).commission).toBe('Fees (USD)')
  })

  it('assigns each source column to at most one field', () => {
    const m = buildFillMapping(['Symbol', 'Side', 'Qty Filled', 'Fill Price', 'Fill Time', 'Order Status'])
    const used = Object.values(m)
    expect(new Set(used).size).toBe(used.length)
    expect(m.status).toBe('Order Status')
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

  it('auto-maps a DeepCharts export (combined Entry/Exit DT, ProfitLoss, sign-encoded side)', () => {
    // DeepCharts ships no side column (direction lives in the quantity sign) and
    // uses combined datetime columns + a "ProfitLoss" P&L header.
    const m = buildImportMapping([
      'Symbol',
      'Quantity',
      'Entry DT',
      'Entry Price',
      'Exit DT',
      'Exit Price',
      'ProfitLoss',
    ])
    expect(m).toEqual({
      symbol: 'Symbol',
      quantity: 'Quantity',
      entryPrice: 'Entry Price',
      exitPrice: 'Exit Price',
      entryDate: 'Entry DT',
      exitDate: 'Exit DT',
      netPnl: 'ProfitLoss',
    })
    // No side column is mapped — direction is resolved from the quantity sign at import.
    expect(m).not.toHaveProperty('side')
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
