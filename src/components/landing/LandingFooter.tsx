import { Github } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import { t } from '@/i18n'
import { COFFEE_URL, DOCS_URL, GITHUB_URL, LICENSE_URL, SPONSOR_URL } from './links'

export default function LandingFooter() {
  return (
    <footer className="border-t border-border bg-card/40">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="flex flex-col items-center gap-10 text-center md:flex-row md:items-start md:justify-between md:text-left">
          {/* Brand */}
          <div className="flex max-w-xs flex-col items-center md:items-start">
            <Logo className="mb-3 h-8" />
            <p className="text-xs leading-relaxed text-muted-foreground">{t('landing.footer.tagline')}</p>
          </div>

          {/* Link groups */}
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-4 sm:gap-16">
            <FooterColumn title={t('landing.footer.product')}>
              <FooterLink href="#features">{t('landing.footer.features')}</FooterLink>
              <FooterLink href="#how">{t('landing.footer.howItWorks')}</FooterLink>
              <FooterLink href="#faq">{t('landing.footer.faq')}</FooterLink>
            </FooterColumn>

            <FooterColumn title={t('landing.footer.resources')}>
              <FooterLink href={GITHUB_URL} external>
                {t('landing.footer.github')}
              </FooterLink>
              <FooterLink href={DOCS_URL} external>
                {t('landing.footer.docs')}
              </FooterLink>
              <FooterLink href={LICENSE_URL} external>
                {t('landing.footer.license')}
              </FooterLink>
            </FooterColumn>

            <FooterColumn title={t('landing.footer.support')}>
              <FooterLink href={COFFEE_URL} external>
                {t('landing.footer.coffee')}
              </FooterLink>
              <FooterLink href={SPONSOR_URL} external>
                {t('landing.footer.sponsor')}
              </FooterLink>
            </FooterColumn>

            <FooterColumn title={t('landing.footer.legal')}>
              <FooterLink href="/privacy">{t('landing.footer.privacy')}</FooterLink>
              <FooterLink href="/terms">{t('landing.footer.terms')}</FooterLink>
            </FooterColumn>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">{t('landing.footer.rights')}</p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground transition-colors hover:text-foreground"
            aria-label="GitHub"
          >
            <Github className="h-4 w-4" />
          </a>
        </div>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground/70 sm:text-left">
          {t('landing.footer.disclaimer')}
        </p>
      </div>
    </footer>
  )
}

/* ─── Footer helpers ─────────────────────────────────────────────────────────── */
function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start">
      <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h4>
      <ul className="space-y-2 text-sm text-left">{children}</ul>
    </div>
  )
}

function FooterLink({ href, external, children }: { href: string; external?: boolean; children: React.ReactNode }) {
  const className = 'text-muted-foreground transition-colors hover:text-foreground'
  if (external) {
    return (
      <li>
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
          {children}
        </a>
      </li>
    )
  }
  return (
    <li>
      <a href={href} className={className}>
        {children}
      </a>
    </li>
  )
}
