import TradeSettingsClient from '@/components/settings/TradeSettingsClient'
import { readGlobalSettings } from '@/lib/global-settings'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('meta.settingsTrade') }

export default async function TradeSettingsPage() {
  const settings = await readGlobalSettings()
  return (
    <div className="p-4 sm:p-6 animate-in">
      <TradeSettingsClient settings={settings} />
    </div>
  )
}
