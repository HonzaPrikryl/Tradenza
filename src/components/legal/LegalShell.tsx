import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { t } from '@/i18n'

export function LegalShell({
  title,
  effectiveDate,
  children,
}: {
  title: string
  effectiveDate: string
  children: ReactNode
}) {
  return (
    <div className="mx-auto min-h-screen max-w-3xl px-6 py-12 sm:py-16">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('legal.home')}
      </Link>

      <h1 className="mt-6 text-2xl font-bold text-foreground sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('legal.lastUpdated', { date: effectiveDate })}</p>

      <div className="mt-8">{children}</div>

      <div className="mt-12 flex gap-4 border-t border-border pt-6 text-sm">
        <Link href="/privacy" className="text-muted-foreground transition-colors hover:text-foreground">
          {t('legal.privacy')}
        </Link>
        <Link href="/terms" className="text-muted-foreground transition-colors hover:text-foreground">
          {t('legal.terms')}
        </Link>
      </div>
    </div>
  )
}

export function LH({ children }: { children: ReactNode }) {
  return <h2 className="mb-2 mt-8 text-lg font-semibold text-foreground">{children}</h2>
}

export function LP({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-sm leading-relaxed text-muted-foreground">{children}</p>
}

export function LUL({ children }: { children: ReactNode }) {
  return <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">{children}</ul>
}

export function LA({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith('http') || href.startsWith('mailto:')
  return (
    <a
      href={href}
      className="text-primary underline underline-offset-2 hover:opacity-80"
      {...(external && !href.startsWith('mailto:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {children}
    </a>
  )
}
