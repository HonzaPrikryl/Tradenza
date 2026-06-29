import { useCallback, useEffect, useRef, useState } from 'react'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

/**
 * Debounced auto-save for a text field. Tracks the editor value and a
 * save-status state, debounces persistence, dedupes no-op saves and exposes a
 * `flush` for blur and a `reset` for when the source value changes externally.
 */
export function useAutosave(
  initial: string,
  persist: (text: string) => Promise<unknown>,
  { delay = 800 }: { delay?: number } = {},
) {
  const [value, setValue] = useState(initial)
  const [state, setState] = useState<SaveState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef(initial)
  const persistRef = useRef(persist)
  persistRef.current = persist
  const valueRef = useRef(value)
  valueRef.current = value

  const save = useCallback(async (text: string) => {
    if (text === lastSaved.current) {
      setState('idle')
      return
    }
    setState('saving')
    try {
      await persistRef.current(text)
      lastSaved.current = text
      setState('saved')
    } catch {
      setState('error')
    }
  }, [])

  const onChange = useCallback(
    (text: string) => {
      setValue(text)
      setState('dirty')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => save(text), delay)
    },
    [delay, save],
  )

  /** Cancel any pending debounce and persist the current value immediately. */
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    save(valueRef.current)
  }, [save])

  /** Reset to a new source value (e.g. after switching record), no save. */
  const reset = useCallback((text: string) => {
    setValue(text)
    lastSaved.current = text
    setState('idle')
  }, [])

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  return { value, state, onChange, flush, reset }
}
