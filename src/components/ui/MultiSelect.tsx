'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export interface MultiOption {
  value: string
  label: string
  dot?: string
}

interface Props {
  options: MultiOption[]
  value: string[]
  onChange: (ids: string[]) => void
  disabledIds?: string[]
  className?: string
  placeholder?: string
}

interface Pos {
  left: number
  width: number
  top?: number
  bottom?: number
  maxH: number
}

export default function MultiSelect({ options, value, onChange, disabledIds = [], className, placeholder }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<Pos | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const place = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const spaceAbove = r.top
    const desired = 264
    if (spaceBelow >= 220 || spaceBelow >= spaceAbove) {
      setPos({
        left: r.left,
        width: r.width,
        top: r.bottom + 4,
        maxH: Math.max(120, Math.min(desired, spaceBelow - 8)),
      })
    } else {
      setPos({
        left: r.left,
        width: r.width,
        bottom: window.innerHeight - r.top + 4,
        maxH: Math.max(120, Math.min(desired, spaceAbove - 8)),
      })
    }
  }

  useEffect(() => {
    if (!open) return
    place()
    const onDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const close = () => setOpen(false)
    const onScroll = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', onScroll, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const enabled = options.filter((o) => !disabledIds.includes(o.value))
  const allSelected = enabled.length > 0 && enabled.every((o) => value.includes(o.value))

  const toggle = (id: string) => {
    if (disabledIds.includes(id)) return
    if (value.includes(id)) onChange(value.filter((x) => x !== id))
    else onChange([...value, id])
  }
  const toggleAll = () => {
    if (allSelected) onChange([])
    else onChange(enabled.map((o) => o.value))
  }

  const summary =
    value.length === 0
      ? (placeholder ?? t('filters.tags.placeholder'))
      : allSelected
        ? t('filters.tags.selectAll')
        : t('filters.tags.selected', { count: value.length })

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={options.length === 0}
        className={cn(
          'flex items-center justify-between gap-2 w-full bg-input border border-border rounded-md px-3 py-2 text-sm',
          'focus:outline-none focus:ring-1 focus:ring-ring hover:border-foreground/20 transition-colors disabled:opacity-50',
          value.length === 0 && 'text-muted-foreground',
          className,
        )}
      >
        <span className="truncate">{options.length === 0 ? t('filters.tags.noValues') : summary}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>

      {open &&
        pos &&
        options.length > 0 &&
        createPortal(
          <div
            ref={menuRef}
            data-open-dropdown
            style={{
              position: 'fixed',
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
              maxHeight: pos.maxH,
            }}
            className="z-[120] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-2xl"
          >
            {/* Select all */}
            <button
              type="button"
              onClick={toggleAll}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border',
                  allSelected && 'border-primary bg-primary',
                )}
              >
                {allSelected && <Check className="h-3 w-3 text-primary-foreground" />}
              </span>
              {t('filters.tags.selectAll')}
            </button>
            <div className="my-1 h-px bg-border" />
            {options.map((o) => {
              const checked = value.includes(o.value)
              const isDisabled = disabledIds.includes(o.value)
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => toggle(o.value)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                    isDisabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-accent',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border',
                      checked && 'border-primary bg-primary',
                    )}
                  >
                    {checked && <Check className="h-3 w-3 text-primary-foreground" />}
                  </span>
                  {o.dot && <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: o.dot }} />}
                  <span className="truncate">{o.label}</span>
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
