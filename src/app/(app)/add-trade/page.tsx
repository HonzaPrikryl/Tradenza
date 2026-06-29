import AccountsList from '@/components/accounts/AccountsList'
import { getAccounts } from '@/lib/actions/accounts'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('meta.tradingAccounts') }

export default async function AddTradePage() {
  const accounts = await getAccounts(true)

  return (
    <div className="p-4 sm:p-6 w-full animate-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">{t('tradingAccounts.pageTitle')}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t('tradingAccounts.pageSubtitle')}</p>
      </div>
      <AccountsList accounts={accounts} title={t('tradingAccounts.cardTitle')} />
    </div>
  )
}
