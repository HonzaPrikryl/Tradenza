'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Wallet,
  Globe,
  Tags,
  History,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'

interface NavItem {
  labelKey: string
  icon: LucideIcon
  href?: string
}

interface NavSection {
  titleKey: string
  items: NavItem[]
}

const SECTIONS: NavSection[] = [
  {
    titleKey: 'settings.sectionGeneral',
    items: [
      { labelKey: 'settings.nav.accounts', icon: Wallet, href: '/settings/accounts' },
      { labelKey: 'settings.nav.tradeSettings', icon: SlidersHorizontal, href: '/settings/trade-settings' },
      { labelKey: 'settings.nav.globalSettings', icon: Globe, href: '/settings/global-settings' },
      { labelKey: 'settings.nav.tags', icon: Tags, href: '/settings/tags' },
      { labelKey: 'settings.nav.importHistory', icon: History, href: '/settings/import-history' },
    ],
  },
]

function ScrollTabs({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [canL, setCanL] = useState(false)
  const [canR, setCanR] = useState(false)

  const update = () => {
    const el = ref.current
    if (!el) return
    setCanL(el.scrollLeft > 4)
    setCanR(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }

  useEffect(() => {
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const by = (dir: number) => ref.current?.scrollBy({ left: dir * 180, behavior: 'smooth' })

  return (
    <div className="relative">
      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-gradient-to-r from-card to-transparent lg:hidden transition-opacity',
          canL ? 'opacity-100' : 'opacity-0',
        )}
      />
      <button
        type="button"
        onClick={() => by(-1)}
        aria-label={t('common.scrollLeft')}
        className={cn(
          'absolute left-0 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-opacity hover:text-foreground lg:hidden',
          canL ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div
        ref={ref}
        onScroll={update}
        className="flex gap-1 overflow-x-auto no-scrollbar lg:flex-col lg:gap-0 lg:space-y-0.5 lg:overflow-visible"
      >
        {children}
      </div>

      <div
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-gradient-to-l from-card to-transparent lg:hidden transition-opacity',
          canR ? 'opacity-100' : 'opacity-0',
        )}
      />
      <button
        type="button"
        onClick={() => by(1)}
        aria-label={t('common.scrollRight')}
        className={cn(
          'absolute right-0 top-1/2 z-20 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-opacity hover:text-foreground lg:hidden',
          canR ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function SettingsSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-full lg:w-60 lg:shrink-0 border-b lg:border-b-0 lg:border-r border-border bg-card/40 lg:overflow-y-auto">
      <div className="hidden lg:block px-5 py-5 border-b border-border">
        <h2 className="text-base font-semibold tracking-tight">{t('settings.title')}</h2>
      </div>

      <nav className="px-3 py-3 lg:py-4 lg:space-y-6">
        {SECTIONS.map((section) => (
          <div key={section.titleKey}>
            <p className="hidden lg:block px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t(section.titleKey)}
            </p>
            <ScrollTabs>
              {section.items.map((item) => {
                const active = item.href ? pathname === item.href : false
                const Icon = item.icon
                const className = cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors shrink-0 whitespace-nowrap lg:shrink lg:w-full',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : item.href
                      ? 'text-muted-foreground hover:text-foreground hover:bg-accent'
                      : 'text-muted-foreground/70 hover:text-foreground hover:bg-accent cursor-pointer',
                )
                const content = (
                  <>
                    <Icon className="w-4 h-4 shrink-0" />
                    {t(item.labelKey)}
                  </>
                )
                return item.href ? (
                  <Link key={item.labelKey} href={item.href} className={className}>
                    {content}
                  </Link>
                ) : (
                  <button key={item.labelKey} type="button" className={cn(className, 'text-left')}>
                    {content}
                  </button>
                )
              })}
            </ScrollTabs>
          </div>
        ))}
      </nav>
    </aside>
  )
}
