import { describe, it, expect } from 'vitest'
import { normalizeMtDeals } from './mt5-deals'
import { buildImportMapping, extractTable } from './csv-columns'

const HEADERS = [
  'Time',
  'Deal',
  'Symbol',
  'Type',
  'Direction',
  'Volume',
  'Price',
  'Order',
  'Commission',
  'Fee',
  'Swap',
  'Profit',
  'Balance',
  'Comment',
]

const deal = (
  time: string,
  symbol: string,
  type: string,
  dir: string,
  vol: string,
  price: string,
  comm: string,
  swap: string,
  profit: string,
) => [time, '1', symbol, type, dir, vol, price, '1', comm, '0', swap, profit, '0', '']

const table = (rows: string[][]) => extractTable([HEADERS, ...rows])

describe('normalizeMtDeals', () => {
  it('pairs in/out deals into one round-trip row with the broker profit', () => {
    const res = normalizeMtDeals(
      table([
        ['2026.08.27 09:00:00', '1', '', 'balance', '', '', '', '', '0', '0', '0', '1000', '1000', 'deposit'],
        deal('2026.08.27 10:00:00', 'XAUUSD+', 'sell', 'in', '0.01', '2400.50', '-0.07', '0', '0'),
        deal('2026.08.27 11:00:00', 'XAUUSD+', 'buy', 'out', '0.01', '2395.00', '-0.07', '-0.10', '5.50'),
      ]),
    )
    expect(res.converted).toBe(true)
    expect(res.rows).toEqual([
      {
        Symbol: 'XAUUSD+',
        Type: 'sell',
        Volume: '0.01',
        'Entry Price': '2400.5',
        'Entry Time': '2026.08.27 10:00:00',
        'Exit Price': '2395',
        'Exit Time': '2026.08.27 11:00:00',
        Fees: '0.24',
        'Gross P&L': '5.5',
        'Net P&L': '5.26',
        Comment: '',
      },
    ])
  })

  it('maps the converted rows onto the importer fields', () => {
    const { headers } = normalizeMtDeals(
      table([
        deal('t1', 'NAS100+', 'buy', 'in', '1', '100', '0', '0', '0'),
        deal('t2', 'NAS100+', 'sell', 'out', '1', '101', '0', '0', '1'),
      ]),
    )
    expect(buildImportMapping(headers)).toMatchObject({
      symbol: 'Symbol',
      side: 'Type',
      quantity: 'Volume',
      entryPrice: 'Entry Price',
      exitPrice: 'Exit Price',
      entryDate: 'Entry Time',
      exitDate: 'Exit Time',
      fees: 'Fees',
      grossPnl: 'Gross P&L',
      netPnl: 'Net P&L',
    })
  })

  it('splits a scale-out across chunks of the same entry and keeps leftovers open', () => {
    const { rows } = normalizeMtDeals(
      table([
        deal('t1', 'EURUSD', 'buy', 'in', '0.3', '1.1000', '-0.30', '0', '0'),
        deal('t2', 'EURUSD', 'sell', 'out', '0.1', '1.1010', '0', '0', '10'),
        deal('t3', 'EURUSD', 'sell', 'out', '0.1', '1.1020', '0', '0', '20'),
      ]),
    )
    expect(rows.map((r) => [r.Volume, r['Entry Time'], r['Exit Price'], r['Net P&L']])).toEqual([
      ['0.1', 't1', '1.101', '9.9'],
      ['0.1', 't1', '1.102', '19.9'],
      ['0.1', 't1', '', ''],
    ])
  })

  it('closes FIFO across several entries', () => {
    const { rows } = normalizeMtDeals(
      table([
        deal('t1', 'US30', 'buy', 'in', '1', '100', '0', '0', '0'),
        deal('t2', 'US30', 'buy', 'in', '1', '110', '0', '0', '0'),
        deal('t3', 'US30', 'sell', 'out', '2', '120', '0', '0', '30'),
      ]),
    )
    expect(rows.map((r) => [r['Entry Price'], r['Gross P&L']])).toEqual([
      ['100', '15'],
      ['110', '15'],
    ])
  })

  it('treats in/out as a reversal on a netting account', () => {
    const { rows } = normalizeMtDeals(
      table([
        deal('t1', 'NAS100', 'buy', 'in', '1', '100', '0', '0', '0'),
        deal('t2', 'NAS100', 'sell', 'in/out', '3', '105', '0', '0', '5'),
      ]),
    )
    expect(rows.map((r) => [r.Type, r.Volume, r['Gross P&L']])).toEqual([
      ['buy', '1', '5'],
      ['sell', '2', ''],
    ])
  })

  it('drops an exit with no entry in the file', () => {
    const { rows } = normalizeMtDeals(
      table([
        deal('t1', 'NAS100', 'sell', 'out', '1', '100', '0', '0', '7'),
        deal('t2', 'NAS100', 'buy', 'in', '1', '100', '0', '0', '0'),
        deal('t3', 'NAS100', 'sell', 'out', '1', '101', '0', '0', '1'),
      ]),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]['Gross P&L']).toBe('1')
  })

  it('reads comma-decimal reports', () => {
    const { rows } = normalizeMtDeals(
      table([
        deal('t1', 'XAUUSD', 'buy', 'in', '0,01', '2400,50', '0', '0', '0'),
        deal('t2', 'XAUUSD', 'sell', 'out', '0,01', '2401,50', '0', '0', '1,00'),
      ]),
    )
    expect(rows[0]).toMatchObject({ Volume: '0.01', 'Entry Price': '2400.5', 'Gross P&L': '1' })
  })

  it('leaves any other table untouched', () => {
    const t = extractTable([
      ['Symbol', 'Side', 'Qty', 'Entry Price', 'Exit Price', 'Entry Time'],
      ['ES', 'buy', '1', '5000', '5010', '2026-01-01 10:00'],
    ])
    expect(normalizeMtDeals(t)).toEqual({ ...t, converted: false })
  })
})
