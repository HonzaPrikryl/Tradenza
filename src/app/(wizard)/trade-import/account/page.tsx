import WizardChrome from '@/components/trade-import/WizardChrome'
import AccountStep from '@/components/trade-import/AccountStep'
import { getBroker } from '@/lib/brokers'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('addTrades.account.title') }

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ broker?: string }> }) {
  const { broker: brokerId = 'generic' } = await searchParams
  const broker = getBroker(brokerId)

  return (
    <div className="flex min-h-screen flex-col">
      <WizardChrome step={2} backHref="/trade-import" />
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center px-4 pb-16 pt-6">
        <p className="text-xs font-medium text-muted-foreground">{t('addTrades.eyebrow')}</p>
        <h1 className="mt-1 text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('addTrades.account.title')}
        </h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">{t('addTrades.account.subtitle')}</p>
        <div className="mt-8 w-full">
          <AccountStep brokerId={brokerId} brokerName={broker?.name ?? null} />
        </div>
      </div>
    </div>
  )
}
