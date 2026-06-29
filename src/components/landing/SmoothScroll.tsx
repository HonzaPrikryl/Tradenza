'use client'

import { useEffect } from 'react'
import Lenis from 'lenis'

/**
 * Smooth scrolling powered by Lenis.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const lenis = new Lenis({
      duration: 1.1,
      easing: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      autoRaf: true,
    })

    // Height of the sticky nav, so anchored sections aren't hidden beneath it.
    const NAV_OFFSET = -72

    const onClick = (e: MouseEvent) => {
      const link = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href^="#"]')
      if (!link) return
      const hash = link.getAttribute('href')
      if (!hash || hash === '#') return
      const target = document.querySelector(hash)
      if (!target) return
      e.preventDefault()
      lenis.scrollTo(target as HTMLElement, { offset: NAV_OFFSET })
      history.pushState(null, '', hash)
    }

    document.addEventListener('click', onClick)

    return () => {
      document.removeEventListener('click', onClick)
      lenis.destroy()
    }
  }, [])

  return null
}
