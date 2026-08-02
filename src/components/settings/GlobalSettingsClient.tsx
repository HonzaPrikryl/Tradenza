'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { t } from '@/i18n'
import Select from '@/components/ui/Select'
import { type GlobalSettings } from '@/lib/global-settings'
import { saveUserTimezone } from '@/lib/actions/user-timezone'
import { browserTimezone, timezoneOptions, FALLBACK_TIMEZONE } from '@/lib/timezones'

export default function GlobalSettingsClient({ settings }: { settings: GlobalSettings }) {
  const router = useRouter()
  const [, start] = useTransition()
  const [timezone, setTimezone] = useState(settings.timezone ?? browserTimezone() ?? FALLBACK_TIMEZONE)

  const onTimezone = (v: string) => {
    setTimezone(v)
    start(async () => {
      await saveUserTimezone(v)
      toast.success(t('settings.global.saved'))
      router.refresh()
    })
  }

  const tzOptions = useMemo(() => timezoneOptions(timezone), [timezone])

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-base font-semibold tracking-tight">{t('settings.global.title')}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{t('settings.global.subtitle')}</p>
      </div>

      <div className="max-w-md space-y-6 px-5 py-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium">{t('settings.global.timezone')}</label>
          <Select value={timezone} onValueChange={onTimezone} options={tzOptions} />
          <p className="mt-1.5 text-xs text-muted-foreground">{t('settings.global.timezoneHint')}</p>
        </div>
      </div>
    </div>
  )
}
