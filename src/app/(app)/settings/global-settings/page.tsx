import GlobalSettingsClient from '@/components/settings/GlobalSettingsClient'
import { readGlobalSettings } from '@/lib/global-settings'
import { t } from '@/i18n'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('meta.settingsGlobal') }

export default async function GlobalSettingsPage() {
  const settings = await readGlobalSettings()
  return (
    <div className="p-4 sm:p-6 animate-in">
      <GlobalSettingsClient settings={settings} />
    </div>
  )
}
