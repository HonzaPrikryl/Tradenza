'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { handleRateLimit } from '@/components/ui/rate-limit-toast'
import { setTradeChecklistProgress } from '@/lib/actions/trades'
import type { StrategyDTO } from '@/lib/actions/strategies'
import StrategyPanel from './StrategyPanel'
import { t } from '@/i18n'

interface Current {
  id: string
  name: string
}

type Progress = { entry: string[]; exit: string[] }

export default function TradePlaybookPanel({
  tradeId,
  strategies,
  current,
  initialProgress,
}: {
  tradeId: string
  strategies: StrategyDTO[]
  current: Current | null
  initialProgress: Progress | null
}) {
  const selected = current ? (strategies.find((s) => s.id === current.id) ?? null) : null

  return (
    <div className="space-y-4">
      <StrategyPanel tradeId={tradeId} strategies={strategies} current={current} />
      {selected && (selected.entryChecklist.length > 0 || selected.exitChecklist.length > 0) && (
        <ChecklistCard
          tradeId={tradeId}
          entryCriteria={selected.entryChecklist}
          exitCriteria={selected.exitChecklist}
          initialProgress={initialProgress}
        />
      )}
    </div>
  )
}

function ChecklistCard({
  tradeId,
  entryCriteria,
  exitCriteria,
  initialProgress,
}: {
  tradeId: string
  entryCriteria: string[]
  exitCriteria: string[]
  initialProgress: Progress | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [entry, setEntry] = useState<Set<string>>(() => new Set(initialProgress?.entry ?? []))
  const [exit, setExit] = useState<Set<string>>(() => new Set(initialProgress?.exit ?? []))

  const totals = useMemo(() => {
    const done = entryCriteria.filter((c) => entry.has(c)).length + exitCriteria.filter((c) => exit.has(c)).length
    return { done, total: entryCriteria.length + exitCriteria.length }
  }, [entry, exit, entryCriteria, exitCriteria])

  function persist(nextEntry: Set<string>, nextExit: Set<string>) {
    startTransition(async () => {
      const res = await setTradeChecklistProgress(tradeId, {
        entry: entryCriteria.filter((c) => nextEntry.has(c)),
        exit: exitCriteria.filter((c) => nextExit.has(c)),
      })
      if (handleRateLimit(res)) return
      router.refresh()
    })
  }

  function toggle(kind: 'entry' | 'exit', criterion: string) {
    if (kind === 'entry') {
      const next = new Set(entry)
      if (next.has(criterion)) next.delete(criterion)
      else next.add(criterion)
      setEntry(next)
      persist(next, exit)
    } else {
      const next = new Set(exit)
      if (next.has(criterion)) next.delete(criterion)
      else next.add(criterion)
      setExit(next)
      persist(entry, next)
    }
  }

  function toggleAll(kind: 'entry' | 'exit', check: boolean) {
    if (kind === 'entry') {
      const next = check ? new Set(entryCriteria) : new Set<string>()
      setEntry(next)
      persist(next, exit)
    } else {
      const next = check ? new Set(exitCriteria) : new Set<string>()
      setExit(next)
      persist(entry, next)
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('trades.detail.playbook.checklistTitle')}</h2>
        <span className="text-xs tabular text-muted-foreground">
          {t('trades.detail.playbook.progress', { done: totals.done, total: totals.total })}
        </span>
      </div>

      {entryCriteria.length > 0 && (
        <ChecklistGroup
          title={t('strategies.detail.entryChecklistTitle')}
          items={entryCriteria}
          checked={entry}
          disabled={pending}
          onToggle={(c) => toggle('entry', c)}
          onToggleAll={(check) => toggleAll('entry', check)}
        />
      )}
      {exitCriteria.length > 0 && (
        <div className={entryCriteria.length > 0 ? 'mt-3 border-t border-border pt-3' : ''}>
          <ChecklistGroup
            title={t('strategies.detail.exitChecklistTitle')}
            items={exitCriteria}
            checked={exit}
            disabled={pending}
            onToggle={(c) => toggle('exit', c)}
            onToggleAll={(check) => toggleAll('exit', check)}
          />
        </div>
      )}
    </div>
  )
}

function ChecklistGroup({
  title,
  items,
  checked,
  disabled,
  onToggle,
  onToggleAll,
}: {
  title: string
  items: string[]
  checked: Set<string>
  disabled: boolean
  onToggle: (criterion: string) => void
  onToggleAll: (check: boolean) => void
}) {
  const allChecked = items.every((item) => checked.has(item))
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <button
          type="button"
          onClick={() => onToggleAll(!allChecked)}
          disabled={disabled}
          className="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-60"
        >
          {allChecked ? t('trades.detail.playbook.uncheckAll') : t('trades.detail.playbook.checkAll')}
        </button>
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => {
          const isChecked = checked.has(item)
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => onToggle(item)}
                disabled={disabled}
                aria-pressed={isChecked}
                className="flex w-full items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm leading-snug transition-colors hover:bg-accent disabled:opacity-60"
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                    isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {isChecked && <Check className="h-3 w-3" />}
                </span>
                <span className={cn(isChecked && 'text-muted-foreground line-through')}>{item}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
