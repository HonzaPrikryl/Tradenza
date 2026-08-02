import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AddTradePanel, { type AddTradeMode } from '@/components/trade-import/AddTradePanel'
import { getAccounts } from '@/lib/actions/accounts'
import { getBroker, GENERIC_BROKER } from '@/lib/brokers'
import { readGlobalSettings } from '@/lib/global-settings'
import { FALLBACK_TIMEZONE } from '@/lib/timezones'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('tradingAccounts.addTrade') }

export default async function AddTradeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>
  searchParams: Promise<{ mode?: string }>
}) {
  const { accountId } = await params
  const { mode } = await searchParams

  const [accounts, settings] = await Promise.all([getAccounts(true), readGlobalSettings()])
  const account = accounts.find((a) => a.id === accountId)
  if (!account) redirect('/add-trade')

  const broker = getBroker(account.broker ?? undefined) ?? GENERIC_BROKER

  const initialMode: AddTradeMode =
    mode === 'manual' || mode === 'upload' ? mode : account.importedCount > 0 ? 'upload' : 'manual'

  return (
    <div className="p-6 animate-in">
      <div className="mb-6">
        <Link
          href="/add-trade"
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('addTrades.common.back')}
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{t('tradingAccounts.addTrade')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {t('addTrades.manual.intoAccount')} <span className="font-medium text-foreground">{account.name}</span>
        </p>
      </div>

      <AddTradePanel
        broker={broker}
        accountId={account.id}
        defaultTimezone={account.timezone || settings.timezone || FALLBACK_TIMEZONE}
        initialMode={initialMode}
      />
    </div>
  )
}
