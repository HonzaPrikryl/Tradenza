'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * Low-level dialog shell shared by every modal in the app. Handles the portal,
 * backdrop, centering, mount-safety and Escape/Enter keys. Callers provide the
 * inner content (header / body / footer) and may tweak the card via `className`
 * (e.g. `max-w-2xl`, `rounded-xl`, `overflow-y-auto`).
 */
export default function Dialog({
  open = true,
  onClose,
  onEnter,
  children,
  className,
  z = 'z-50',
  closeOnBackdrop = true,
}: {
  open?: boolean
  onClose: () => void
  onEnter?: () => void
  children: React.ReactNode
  className?: string
  z?: string
  closeOnBackdrop?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'Enter' && onEnter) onEnter()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, onEnter])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className={cn('fixed inset-0 flex items-center justify-center overflow-y-auto overscroll-contain p-4', z)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        className={cn(
          'relative my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card shadow-2xl',
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
