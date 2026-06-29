import AccountsList from '@/components/accounts/AccountsList'
import { getAccounts } from '@/lib/actions/accounts'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('meta.settingsAccounts') }

export default async function SettingsAccountsPage() {
  const accounts = await getAccounts(true)

  return (
    <div className="p-4 sm:p-6 animate-in">
      <AccountsList
        accounts={accounts}
        title={t('settings.accounts.title')}
        subtitle={t('settings.accounts.subtitle')}
      />
    </div>
  )
}
