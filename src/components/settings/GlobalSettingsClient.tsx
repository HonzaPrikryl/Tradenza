'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { t } from '@/i18n'
import Select from '@/components/ui/Select'
import { setTimezonePref, type GlobalSettings } from '@/lib/global-settings'

const TIMEZONES = [
  'UTC',
  'Europe/Prague',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
]

export default function GlobalSettingsClient({ settings }: { settings: GlobalSettings }) {
  const router = useRouter()
  const [, start] = useTransition()

  const browserTz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'
  const initialTz = settings.timezone ?? (TIMEZONES.includes(browserTz) ? browserTz : 'UTC')

  const [timezone, setTimezone] = useState(initialTz)

  useEffect(() => {
    if (!settings.timezone) start(() => setTimezonePref(initialTz).then(() => router.refresh()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onTimezone = (v: string) => {
    setTimezone(v)
    start(async () => {
      await setTimezonePref(v)
      toast.success(t('settings.global.saved'))
      router.refresh()
    })
  }
  const gmtLabel = (tz: string): string => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(
        new Date(),
      )
      const off = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT'
      return off === 'GMT' ? 'GMT+00:00' : off
    } catch {
      return 'GMT'
    }
  }

  const tzOptions = (TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]).map((z) => ({
    value: z,
    label: `(${gmtLabel(z)}) ${z}`,
  }))

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
