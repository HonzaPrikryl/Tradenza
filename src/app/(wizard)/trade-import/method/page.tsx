import Link from 'next/link'
import WizardChrome from '@/components/trade-import/WizardChrome'
import MethodSelect from '@/components/trade-import/MethodSelect'
import { BrokerIcon } from '@/components/trade-import/shared'
import { getBroker, supportsFutures, type Broker } from '@/lib/brokers'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('addTrades.method.title') }

const GENERIC: Broker = {
  id: 'generic',
  name: '',
  short: 'T',
  className: 'bg-primary/15 text-primary',
  assets: [],
}

export default async function MethodPage({
  searchParams,
}: {
  searchParams: Promise<{ broker?: string; account?: string }>
}) {
  const { broker: brokerId = 'generic', account: accountId = '' } = await searchParams
  const broker = getBroker(brokerId)
  const known = !!broker
  const display = broker ?? GENERIC
  const futures = supportsFutures(broker) || brokerId === 'generic'

  return (
    <div className="flex min-h-screen flex-col">
      <WizardChrome step={3} backHref={`/trade-import/account?broker=${brokerId}`} />
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center px-4 pb-16 pt-6">
        <p className="text-xs font-medium text-muted-foreground">{t('addTrades.eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t('addTrades.method.title')}</h1>

        {/* Linking */}
        <div className="mt-6 flex flex-col items-center gap-3">
          <BrokerIcon broker={display} size="lg" />
          <p className="text-sm text-muted-foreground">
            {t('addTrades.method.linking')}{' '}
            <span className="font-semibold text-foreground">
              {known
                ? broker!.name
                : brokerId === 'generic'
                  ? t('tradingAccounts.genericBroker')
                  : t('addTrades.method.brokerOutOfList')}
            </span>{' '}
            <Link href="/trade-import" className="text-primary hover:underline">
              {t('addTrades.method.changeBroker')}
            </Link>
          </p>
        </div>

        <div className="mt-8 w-full">
          <MethodSelect
            brokerId={brokerId}
            accountId={accountId}
            futures={futures}
            assets={display.assets}
            known={known}
          />
        </div>
      </div>
    </div>
  )
}
