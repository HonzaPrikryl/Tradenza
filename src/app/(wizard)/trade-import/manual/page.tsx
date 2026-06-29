import { redirect } from 'next/navigation'
import WizardChrome from '@/components/trade-import/WizardChrome'
import ManualEntry from '@/components/trade-import/ManualEntry'
import { getAccounts } from '@/lib/actions/accounts'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('addTrades.manual.title') }

export default async function ManualPage({
  searchParams,
}: {
  searchParams: Promise<{ broker?: string; account?: string }>
}) {
  const { broker: brokerId = 'generic', account: accountId } = await searchParams

  if (!accountId) redirect(`/trade-import/account?broker=${brokerId}`)

  const accounts = await getAccounts(true)
  const account = accounts.find((a) => a.id === accountId)
  if (!account) redirect(`/trade-import/account?broker=${brokerId}`)

  return (
    <div className="flex min-h-screen flex-col">
      <WizardChrome step={4} backHref={`/trade-import/method?broker=${brokerId}&account=${accountId}`} />
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-16 pt-6">
        <div className="text-center">
          <p className="text-xs font-medium text-muted-foreground">{t('addTrades.eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t('addTrades.manual.title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('addTrades.manual.intoAccount')} <span className="font-medium text-foreground">{account.name}</span>
          </p>
        </div>
        <div className="mt-8">
          <ManualEntry brokerId={brokerId} accountId={account.id} />
        </div>
      </div>
    </div>
  )
}
