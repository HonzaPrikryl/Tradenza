export type AssetType = 'stocks' | 'futures' | 'options' | 'forex' | 'crypto' | 'cfd'

export interface Broker {
  id: string
  name: string
  short: string
  className: string
  assets: AssetType[]
  popular?: boolean
}

export const ALL_ASSETS: AssetType[] = ['stocks', 'futures', 'options', 'forex', 'crypto', 'cfd']

export const BROKERS: Broker[] = [
  {
    id: 'alpaca',
    name: 'Alpaca',
    short: 'A',
    className: 'bg-amber-400/20 text-amber-300',
    assets: ['stocks', 'crypto'],
  },
  {
    id: 'alpha-futures',
    name: 'Alpha Futures - Alpha Ticks',
    short: 'A',
    className: 'bg-emerald-500/20 text-emerald-300',
    assets: ['futures'],
  },
  {
    id: 'amp-atas',
    name: 'AMP Futures - ATAS',
    short: 'A',
    className: 'bg-sky-500/20 text-sky-300',
    assets: ['futures'],
  },
  {
    id: 'amp-cqg',
    name: 'AMP Futures - CQG Desktop',
    short: 'A',
    className: 'bg-sky-500/20 text-sky-300',
    assets: ['futures'],
  },
  {
    id: 'amp-mt5',
    name: 'AMP Futures - MetaTrader 5',
    short: 'A',
    className: 'bg-sky-500/20 text-sky-300',
    assets: ['futures'],
  },
  {
    id: 'amp-motivewave',
    name: 'AMP Futures - MotiveWave',
    short: 'A',
    className: 'bg-sky-500/20 text-sky-300',
    assets: ['futures'],
  },
  {
    id: 'amp-quantower',
    name: 'AMP Futures - Quantower',
    short: 'A',
    className: 'bg-sky-500/20 text-sky-300',
    assets: ['futures'],
  },
  {
    id: 'amp-rithmic',
    name: 'AMP Futures - Rithmic R Trader',
    short: 'A',
    className: 'bg-sky-500/20 text-sky-300',
    assets: ['futures'],
  },
  {
    id: 'amp-sierra',
    name: 'AMP Futures - Sierra Chart',
    short: 'A',
    className: 'bg-sky-500/20 text-sky-300',
    assets: ['futures'],
  },
  {
    id: 'amp-tickblaze',
    name: 'AMP Futures - TickBlaze',
    short: 'A',
    className: 'bg-sky-500/20 text-sky-300',
    assets: ['futures'],
  },
  {
    id: 'amp-tv',
    name: 'AMP Futures - TradingView Paper Trading',
    short: 'A',
    className: 'bg-sky-500/20 text-sky-300',
    assets: ['futures'],
  },
  { id: 'atas', name: 'ATAS', short: 'A', className: 'bg-blue-500/20 text-blue-300', assets: ['futures'] },
  {
    id: 'deepcharts',
    name: 'DeepCharts',
    short: 'D',
    className: 'bg-violet-500/20 text-violet-300',
    assets: ['futures'],
    popular: true,
  },
  { id: 'bybit', name: 'ByBit', short: 'B', className: 'bg-amber-500/20 text-amber-300', assets: ['crypto'] },
  {
    id: 'bybit-mt5',
    name: 'ByBit - MetaTrader 5',
    short: 'B',
    className: 'bg-amber-500/20 text-amber-300',
    assets: ['crypto', 'forex'],
  },
  {
    id: 'rithmic',
    name: 'Rithmic R Trader',
    short: 'R',
    className: 'bg-emerald-500/20 text-emerald-300',
    assets: ['futures'],
  },
  { id: 'ftmo', name: 'FTMO', short: 'F', className: 'bg-zinc-200/20 text-zinc-100', assets: ['futures', 'forex'] },
  {
    id: 'topstepx',
    name: 'TopstepX',
    short: 'T',
    className: 'bg-zinc-100/15 text-zinc-100',
    assets: ['futures'],
    popular: true,
  },
  {
    id: 'tradovate',
    name: 'Tradovate',
    short: 'T',
    className: 'bg-blue-500/20 text-blue-300',
    assets: ['futures'],
    popular: true,
  },
  {
    id: 'ctrader',
    name: 'cTrader',
    short: 'c',
    className: 'bg-red-500/20 text-red-300',
    assets: ['forex', 'cfd'],
    popular: true,
  },
  {
    id: 'tradelocker',
    name: 'TradeLocker',
    short: 'T',
    className: 'bg-zinc-200/15 text-zinc-100',
    assets: ['forex', 'cfd'],
    popular: true,
  },
  {
    id: 'ibkr',
    name: 'Interactive Brokers',
    short: 'IB',
    className: 'bg-red-500/20 text-red-300',
    assets: ['stocks', 'options', 'futures', 'forex'],
    popular: true,
  },
  {
    id: 'mt4',
    name: 'MetaTrader 4',
    short: 'M4',
    className: 'bg-emerald-600/20 text-emerald-300',
    assets: ['forex', 'cfd'],
    popular: true,
  },
  {
    id: 'mt5',
    name: 'MetaTrader 5',
    short: 'M5',
    className: 'bg-sky-600/20 text-sky-300',
    assets: ['forex', 'cfd', 'futures'],
    popular: true,
  },
  {
    id: 'thinkorswim',
    name: 'Thinkorswim',
    short: 'tos',
    className: 'bg-green-500/20 text-green-300',
    assets: ['stocks', 'options', 'futures'],
    popular: true,
  },
]

export const POPULAR_BROKERS = BROKERS.filter((b) => b.popular)

export function getBroker(id: string | null | undefined): Broker | undefined {
  if (!id) return undefined
  return BROKERS.find((b) => b.id === id)
}

export function searchBrokers(query: string): Broker[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return BROKERS.filter((b) => b.name.toLowerCase().includes(q))
}

export function supportsFutures(b: Broker | undefined): boolean {
  return !!b?.assets.includes('futures')
}
