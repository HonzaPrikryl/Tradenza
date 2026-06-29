'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as Popover from '@radix-ui/react-popover'
import { Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t, tList } from '@/i18n'
import Select from '@/components/ui/Select'

const WEEKDAYS = tList('datepicker.weekdaysMin')

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function buildCells(year: number, month: number): (number | null)[] {
  const first = new Date(year, month - 1, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export default function ViewMyDayButton() {
  const router = useRouter()
  const todayKey = new Date().toLocaleDateString('en-CA')
  const [ty, tm] = todayKey.split('-').map(Number)
  const [year, setYear] = useState(ty)
  const [month, setMonth] = useState(tm)
  const [open, setOpen] = useState(false)

  const cells = buildCells(year, month)

  const monthOptions = tList('datepicker.months').map((name, i) => ({ value: String(i + 1), label: name }))
  const yearOptions = Array.from({ length: 7 }, (_, i) => {
    const yr = ty - i
    return { value: String(yr), label: String(yr) }
  })

  function pick(day: number) {
    const key = `${year}-${pad(month)}-${pad(day)}`
    setOpen(false)
    router.push(`/progress/${key}`)
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          aria-label={t('dashboard.viewMyDay')}
          className={cn(
            'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors md:mt-4 md:flex-none md:justify-start',
            'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          <Rocket className="h-4 w-4 shrink-0" />
          <span>{t('dashboard.viewMyDay')}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-72 rounded-xl border border-border bg-popover p-3 shadow-xl animate-fade-in"
          onInteractOutside={(e) => {
            const target = e.target as Element | null
            if (target?.closest('[data-radix-popper-content-wrapper]')) e.preventDefault()
          }}
        >
          <div className="mb-2.5 flex items-center gap-2">
            <Select
              value={String(month)}
              onValueChange={(v) => setMonth(Number(v))}
              options={monthOptions}
              className="h-9 flex-1"
            />
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(Number(v))}
              options={yearOptions}
              className="h-9 w-24"
            />
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-semibold text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day === null) return <span key={i} />
              const key = `${year}-${pad(month)}-${pad(day)}`
              const isToday = key === todayKey
              const isFuture = key > todayKey
              return (
                <button
                  key={i}
                  type="button"
                  disabled={isFuture}
                  onClick={() => pick(day)}
                  className={cn(
                    'flex h-8 items-center justify-center rounded-md text-sm transition-colors',
                    isFuture ? 'cursor-not-allowed text-muted-foreground/30' : 'hover:bg-accent hover:text-foreground',
                    isToday && 'bg-primary/15 font-semibold text-primary',
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
