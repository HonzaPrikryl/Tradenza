import { notFound } from 'next/navigation'
import { getTradeById } from '@/lib/actions/trades'
import { getTagGroups } from '@/lib/actions/tags'
import { getDailyNote } from '@/lib/actions/progress'
import { readGlobalSettings } from '@/lib/global-settings'
import TradeDetailClient from '@/components/trades/TradeDetailClient'
import DemoTradeDetail from '@/components/onboarding/DemoTradeDetail'
import { t } from '@/i18n'
import type { Metadata } from 'next'

const isDemoId = (id: string) => id.startsWith('demo-')

function dayKeyInTz(d: Date, tz: string | null): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || undefined,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  if (isDemoId(id)) return { title: t('onboarding.demo.tradeDetail.title') }
  const trade = await getTradeById(id)
  if (!trade) return { title: t('meta.tradeNotFound') }
  return { title: `${trade.symbol} · ${t(`enums.direction.${trade.direction}`)}` }
}

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (isDemoId(id)) return <DemoTradeDetail />

  const [trade, tagGroups, settings] = await Promise.all([getTradeById(id), getTagGroups(), readGlobalSettings()])
  if (!trade) notFound()

  const dayKey = dayKeyInTz(trade.entryDatetime, settings.timezone)
  const dailyNote = await getDailyNote(dayKey)

  return (
    <TradeDetailClient
      trade={trade}
      tagGroups={tagGroups}
      timezone={settings.timezone}
      dayKey={dayKey}
      dailyNote={dailyNote}
    />
  )
}
