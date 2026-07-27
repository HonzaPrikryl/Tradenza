'use client'

import { useRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

// A tab strip that actually behaves like one.
//
// Hand-rolled `role="tablist"` + `role="tab"` markup promises assistive tech a widget with
// arrow-key navigation and a linked panel, and then delivers neither — which is worse than
// plain buttons, because the promise is what the user navigates by. This owns the three
// things that contract requires:
//
//   • ids + aria-controls / aria-labelledby, so the panel is reachable from the tab;
//   • roving tabindex — the strip is ONE tab stop, not one per tab;
//   • ←/→ to move (wrapping), Home/End to jump, which is what the role advertises.
//
// It deliberately does NOT own the panels. The Discipline page keeps its Habits panel
// mounted-but-hidden so switching tabs doesn't refetch every widget, and a component that
// rendered the panels for you would take that decision away. Callers render their own and
// pass `panelId`.

export interface TabItem<K extends string> {
  key: K
  label: string
  icon?: ReactNode
}

export default function TabList<K extends string>({
  tabs,
  value,
  onChange,
  label,
  /** Base for the generated ids — must be unique per strip on the page. */
  idBase,
  className,
}: {
  tabs: TabItem<K>[]
  value: K
  onChange: (key: K) => void
  /** Accessible name for the strip ("Discipline", "Choose which list to manage"). */
  label: string
  idBase: string
  className?: string
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const focusTab = (key: K) => {
    onChange(key)
    refs.current[key]?.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.key === value)
    if (i === -1) return
    // Wrapping is part of the pattern: from the last tab, → goes back to the first.
    const step: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 }
    if (e.key in step) {
      e.preventDefault()
      focusTab(tabs[(i + step[e.key] + tabs.length) % tabs.length].key)
      return
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      focusTab(e.key === 'Home' ? tabs[0].key : tabs[tabs.length - 1].key)
    }
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('inline-flex rounded-lg border border-border bg-card p-1', className)}
    >
      {tabs.map((tb) => {
        const selected = tb.key === value
        return (
          <button
            key={tb.key}
            ref={(el) => {
              refs.current[tb.key] = el
            }}
            type="button"
            role="tab"
            id={`${idBase}-tab-${tb.key}`}
            aria-controls={`${idBase}-panel-${tb.key}`}
            aria-selected={selected}
            // Roving tabindex — Tab reaches the strip once, arrows move inside it.
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tb.key)}
            className={cn(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors',
              'focus-visible:ring-2 focus-visible:ring-primary focus:outline-none',
              selected ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tb.icon}
            {tb.label}
          </button>
        )
      })}
    </div>
  )
}

/** Props every panel needs to pair with a {@link TabList} tab. Spread onto the wrapper. */
export function tabPanelProps(idBase: string, key: string, selected: boolean) {
  return {
    role: 'tabpanel' as const,
    id: `${idBase}-panel-${key}`,
    'aria-labelledby': `${idBase}-tab-${key}`,
    // A hidden-but-mounted panel must be hidden from assistive tech too, or its content
    // shows up in the reading order of the tab that IS selected.
    hidden: !selected,
  }
}
