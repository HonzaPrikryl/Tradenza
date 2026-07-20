import { getImportHistory } from '@/lib/actions/wizard'
import { t } from '@/i18n'
import ImportHistoryTable from '@/components/settings/ImportHistoryTable'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: t('meta.settingsImportHistory') }

export default async function ImportHistoryPage() {
  const rows = await getImportHistory()

  return (
    <div className="p-4 sm:p-6 animate-in">
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold tracking-tight">{t('settings.importHistory.title')}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('settings.importHistory.subtitle')}</p>
        </div>

        <ImportHistoryTable rows={rows} />
      </div>
    </div>
  )
}
