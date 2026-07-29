'use client'

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
type Phase = 'static' | 'hidden' | 'revealed'

export default function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'li' | 'section'
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('static')

  useIsoLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return

    setPhase('hidden')

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          setPhase('revealed')
          io.disconnect()
        }
      },
      { threshold: 0, rootMargin: '0px 0px -25% 0px' },
    )

    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref as never}
      style={phase === 'static' ? undefined : { transitionDelay: `${delay}ms` }}
      className={cn(
        phase !== 'static' && 'transition-all duration-700 ease-out will-change-transform',
        phase === 'hidden' ? 'translate-y-4 opacity-0' : 'translate-y-0 opacity-100',
        'motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
