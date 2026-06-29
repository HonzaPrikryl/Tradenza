'use client'

import * as Popover from '@radix-ui/react-popover'
import { Plus } from 'lucide-react'
import type { WidgetType, WidgetZone } from '@/lib/dashboard/types'
import { t } from '@/i18n'
import { TOP_WIDGETS, MAIN_WIDGETS } from './widget-registry'

interface Props {
  zone: WidgetZone
  usedTypes: Set<WidgetType>
  disabled?: boolean
  onAdd: (type: WidgetType) => void
  slot?: boolean
}

export default function WidgetPalette({ zone, usedTypes, disabled, onAdd, slot }: Props) {
  const all = zone === 'top' ? TOP_WIDGETS : MAIN_WIDGETS
  const available = all.filter((w) => !usedTypes.has(w.type))

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          disabled={disabled || available.length === 0}
          className={
            slot
              ? 'flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/70 bg-transparent text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40'
              : 'inline-flex h-full min-h-[64px] w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-card/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40'
          }
        >
          <Plus className="h-4 w-4" />
          {slot ? t('dashboard.palette.clickToAdd') : t('dashboard.palette.addWidget')}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          align="center"
          className="z-50 w-64 rounded-lg border border-border bg-popover p-1.5 shadow-xl animate-fade-in max-h-[320px] overflow-y-auto"
        >
          <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
            {zone === 'top' ? t('dashboard.palette.kpiWidgets') : t('dashboard.palette.mainWidgets')}
          </div>
          {available.length === 0 ? (
            <div className="px-2 py-3 text-sm text-muted-foreground text-center">{t('dashboard.palette.allAdded')}</div>
          ) : (
            available.map((w) => {
              const Icon = w.icon
              return (
                <Popover.Close asChild key={w.type}>
                  <button
                    onClick={() => onAdd(w.type)}
                    className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent transition-colors"
                  >
                    <Icon className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-tight">{w.label}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{w.description}</div>
                    </div>
                  </button>
                </Popover.Close>
              )
            })
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
