'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'tradenza-theme'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

function applyThemeClass(theme: Theme) {
  const cl = document.documentElement.classList
  cl.remove('dark', 'light')
  cl.add(theme)
  document.documentElement.style.colorScheme = theme
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('dark')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      // Explicit user choice wins; otherwise fall back to the OS / browser theme.
      const initial: Theme =
        stored === 'light' || stored === 'dark'
          ? stored
          : window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
      setThemeState(initial)
      applyThemeClass(initial)
    } catch {
      /* private mode, etc. */
    }
  }, [])

  // While the user hasn't made an explicit choice, keep following the OS theme
  // if it changes live (e.g. macOS auto day/night).
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      try {
        if (!localStorage.getItem(STORAGE_KEY)) {
          const sys: Theme = mq.matches ? 'dark' : 'light'
          setThemeState(sys)
          applyThemeClass(sys)
        }
      } catch {
        /* noop */
      }
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      /* noop */
    }
    applyThemeClass(t)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
}

export function ThemeScript({ nonce }: { nonce?: string }) {
  // Runs before paint (in <head>) to set the theme class with no flash. Mirrors
  // the provider's logic: stored choice wins, otherwise the OS preference.
  // `nonce` lets this inline script satisfy the nonce-based CSP.
  const js = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark'){t=(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'light';}var c=document.documentElement.classList;c.remove('dark','light');c.add(t);document.documentElement.style.colorScheme=t;}catch(e){}})();`
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: js }} />
}
