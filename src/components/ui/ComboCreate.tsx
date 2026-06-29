'use client'

import { useState } from 'react'
import { ChevronDown, Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOutsideClick } from '@/hooks/useOutsideClick'

export interface ComboOption {
  value: string
  label: string
  dot?: string
}

export default function ComboCreate({
  value,
  onChange,
  options,
  onCreate,
  placeholder,
  createLabel,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  options: ComboOption[]
  onCreate?: (name: string) => Promise<ComboOption | null>
  placeholder?: string
  createLabel?: (name: string) => string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const ref = useOutsideClick<HTMLDivElement>(() => setOpen(false), { enabled: open })

  const selected = options.find((o) => o.value === value)
  const query = q.trim().toLowerCase()
  const filtered = query ? options.filter((o) => o.label.toLowerCase().includes(query)) : options
  const exact = options.some((o) => o.label.toLowerCase() === query)

  const create = async () => {
    const name = q.trim()
    if (!name || !onCreate || busy) return
    setBusy(true)
    try {
      const opt = await onCreate(name)
      if (opt) {
        onChange(opt.value)
        setQ('')
        setOpen(false)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md border border-border bg-input px-3 py-2 text-sm transition-colors',
          open ? 'border-primary ring-1 ring-primary' : 'hover:border-foreground/20',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className={cn('flex min-w-0 items-center gap-2', !selected && 'text-muted-foreground')}>
          {selected?.dot && (
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: selected.dot }} />
          )}
          <span className="truncate">{selected ? selected.label : placeholder}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>

      {open && !disabled && (
        <div className="absolute z-[60] mt-1 w-full rounded-lg border border-border bg-popover py-1 shadow-2xl">
          <div className="px-2 pb-1 pt-1.5">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !exact && onCreate) create()
              }}
              placeholder={placeholder}
              className="w-full rounded-md border border-border bg-input/40 px-2 py-1.5 text-xs focus:border-primary focus:outline-none"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                  setQ('')
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                {o.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: o.dot }} />}
                <span className="min-w-0 flex-1 truncate text-left">{o.label}</span>
                {o.value === value && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </button>
            ))}
            {query && !exact && onCreate && (
              <button
                type="button"
                disabled={busy}
                onClick={create}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-primary transition-colors hover:bg-accent"
              >
                <Plus className="h-3.5 w-3.5" />
                {createLabel ? createLabel(q.trim()) : `Create "${q.trim()}"`}
              </button>
            )}
            {filtered.length === 0 && !query && <p className="px-3 py-2 text-xs text-muted-foreground">—</p>}
          </div>
        </div>
      )}
    </div>
  )
}
