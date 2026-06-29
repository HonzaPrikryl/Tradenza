import { redirect } from 'next/navigation'
import WizardChrome from '@/components/trade-import/WizardChrome'
import UploadStep from '@/components/trade-import/UploadStep'
import { getAccounts } from '@/lib/actions/accounts'
import { getBroker, type Broker } from '@/lib/brokers'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('addTrades.upload.title') }

const GENERIC: Broker = {
  id: 'generic',
  name: 'Generic Template',
  short: 'T',
  className: 'bg-primary/15 text-primary',
  assets: ['futures'],
}

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ broker?: string; account?: string }>
}) {
  const { broker: brokerId = 'generic', account: accountId } = await searchParams
  const broker = getBroker(brokerId) ?? GENERIC

  if (!accountId) redirect(`/trade-import/account?broker=${brokerId}`)

  const accounts = await getAccounts(true)
  const account = accounts.find((a) => a.id === accountId)
  if (!account) redirect(`/trade-import/account?broker=${brokerId}`)

  return (
    <div className="flex min-h-screen flex-col">
      <WizardChrome step={4} backHref={`/trade-import/method?broker=${brokerId}&account=${accountId}`} />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-16 pt-6">
        <div className="text-center">
          <p className="text-xs font-medium text-muted-foreground">{t('addTrades.eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{t('addTrades.upload.title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('addTrades.manual.intoAccount')} <span className="font-medium text-foreground">{account.name}</span>
          </p>
        </div>
        <div className="mt-10">
          <UploadStep broker={broker} accountId={account.id} defaultTimezone={account.timezone ?? 'Europe/Prague'} />
        </div>
      </div>
    </div>
  )
}
