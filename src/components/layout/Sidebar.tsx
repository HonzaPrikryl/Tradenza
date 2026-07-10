'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import { LayoutDashboard, List, BarChart3, Target, BookMarked, Settings, Plus, X, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { t } from '@/i18n'
import Logo from '@/components/ui/Logo'
import ThemeToggle from '@/components/ui/ThemeToggle'
import FeedbackButton from '@/components/feedback/FeedbackButton'
import { useSidebar } from './SidebarContext'

const NAV = [
  { href: '/dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { href: '/trades', labelKey: 'nav.trades', icon: List },
  { href: '/stats', labelKey: 'nav.stats', icon: BarChart3 },
  { href: '/strategies', labelKey: 'nav.strategies', icon: BookMarked },
  { href: '/progress', labelKey: 'nav.progress', icon: Target },
  { href: '/settings/accounts', labelKey: 'nav.settings', icon: Settings },
]

export default function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname()
  const { open, setOpen } = useSidebar()

  useEffect(() => {
    setOpen(false)
  }, [pathname, setOpen])

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-56 flex flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar))] sidebar-glow',
          'transition-transform duration-300 ease-out',
          'lg:static lg:z-auto lg:translate-x-0 lg:shrink-0',
          open ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:shadow-none',
        )}
      >
        {/* Logo */}
        <div className="px-4 py-5 border-b border-[hsl(var(--sidebar-border))] flex items-center justify-between gap-2">
          <Link href="/dashboard" className="flex items-center min-w-0">
            <Logo className="h-10 lg:h-14" priority />
          </Link>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors shrink-0"
            aria-label={t('common.closeMenu')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add trade CTA */}
        <div className="px-3 pt-4">
          <Link
            href="/add-trade"
            className={cn(
              'flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              'bg-primary text-primary-foreground hover:bg-primary/90',
            )}
          >
            <Plus className="w-4 h-4 shrink-0" />
            {t('nav.addTrade')}
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(({ href, labelKey, icon: Icon }) => {
            const active =
              pathname === href ||
              pathname.startsWith(href + '/') ||
              (href.startsWith('/settings') && pathname.startsWith('/settings'))
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                  active
                    ? 'bg-primary/10 text-primary font-medium'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {t(labelKey)}
              </Link>
            )
          })}

          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                pathname === '/admin' || pathname.startsWith('/admin/')
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              {t('nav.admin')}
            </Link>
          )}
        </nav>

        {/* Feedback */}
        <div className="px-3 pb-2">
          <FeedbackButton />
        </div>

        {/* Bottom */}
        <div className="px-4 py-4 border-t border-[hsl(var(--sidebar-border))] flex items-center gap-3">
          <UserButton
            appearance={{
              elements: {
                avatarBox: 'w-7 h-7',
              },
            }}
          />
          <span className="text-xs text-muted-foreground truncate flex-1">{t('nav.profile')}</span>
          <ThemeToggle className="h-8 w-8 shrink-0" />
        </div>
      </aside>
    </>
  )
}
