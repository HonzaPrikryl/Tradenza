'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal, MoreVertical, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

export interface ActionMenuItem {
  key: string
  label: string
  icon: LucideIcon
  danger?: boolean
  separatorBefore?: boolean
}

/**
 * Portal dropdown menu triggered by a kebab button. Handles positioning,
 * outside-click and Escape/scroll/resize dismissal. Shared across trades,
 * accounts and tag management.
 */
export default function ActionMenu({
  items,
  onSelect,
  align = 'right',
  icon = 'vertical',
  width = 192,
}: {
  items: ActionMenuItem[]
  onSelect?: (key: string) => void
  align?: 'left' | 'right'
  icon?: 'horizontal' | 'vertical'
  width?: number
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const place = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const left = align === 'right' ? r.right - width : r.left
    setPos({ top: r.bottom + 4, left: Math.max(8, left) })
  }

  useEffect(() => {
    if (!open) return
    place()
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const TriggerIcon = icon === 'horizontal' ? MoreHorizontal : MoreVertical

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        aria-label={t('common.menu')}
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
          open && 'bg-accent text-foreground',
        )}
      >
        <TriggerIcon className="h-4 w-4" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width }}
            className="z-[100] rounded-lg border border-border bg-popover py-1 shadow-2xl"
          >
            {items.map((item) => (
              <div key={item.key}>
                {item.separatorBefore && <div className="my-1 h-px bg-border" />}
                <button
                  onClick={() => {
                    setOpen(false)
                    onSelect?.(item.key)
                  }}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                    item.danger ? 'text-loss hover:bg-loss/10' : 'text-foreground/90 hover:bg-accent',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
