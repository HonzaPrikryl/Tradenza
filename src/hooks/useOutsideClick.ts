import { useEffect, useRef, type RefObject } from 'react'

interface Options {
  /** Only listen while enabled (typically the "open" flag). Default true. */
  enabled?: boolean
  /** Also close on the Escape key. Default true. */
  escape?: boolean
  /** Clicks inside an element matching this selector are ignored (e.g. a
   *  portalled popover that lives outside the ref). */
  ignoreSelector?: string
}

/**
 * Returns a ref to attach to a container; calls `onClose` when the user clicks
 * outside it (and, by default, on Escape). Replaces the repeated
 * mousedown/keydown dropdown-dismiss effect.
 */
export function useOutsideClick<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  { enabled = true, escape = true, ignoreSelector }: Options = {},
): RefObject<T | null> {
  const ref = useRef<T>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!enabled) return
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Element | null
      if (ignoreSelector && target?.closest?.(ignoreSelector)) return
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current()
    }
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('mousedown', onDoc)
    if (escape) document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      if (escape) document.removeEventListener('keydown', onEsc)
    }
  }, [enabled, escape, ignoreSelector])

  return ref
}
