'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Select from '@/components/ui/Select'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { setTradeStrategy, type StrategyDTO } from '@/lib/actions/strategies'
import { t } from '@/i18n'

const NONE = '__none__'

interface Current {
  id: string
  name: string
}

export default function StrategyPanel({
  tradeId,
  strategies,
  current,
}: {
  tradeId: string
  strategies: StrategyDTO[]
  current: Current | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  // Offer the current strategy even if it was archived (so it isn't dropped).
  const options = current && !strategies.some((s) => s.id === current.id) ? [current, ...strategies] : strategies

  function onChange(value: string) {
    const next = value === NONE ? null : value
    startTransition(async () => {
      const res = await setTradeStrategy(tradeId, next)
      if (handleRateLimit(res)) return
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold">{t('strategies.panel.title')}</h2>
      <Select
        value={current?.id ?? NONE}
        onValueChange={onChange}
        disabled={pending}
        options={[
          { value: NONE, label: t('strategies.panel.none') },
          ...options.map((s) => ({ value: s.id, label: s.name })),
        ]}
      />
    </div>
  )
}
