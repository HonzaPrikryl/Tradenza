import Link from 'next/link'
import { t } from '@/i18n'

export default function AppNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 text-center">
      <div>
        <p className="mb-4 text-6xl font-semibold text-muted-foreground/30">404</p>
        <h1 className="mb-2 text-xl font-semibold">{t('error.notfound.title')}</h1>
        <p className="mb-6 text-sm text-muted-foreground">{t('error.notfound.desc')}</p>
        <Link href="/dashboard" className="text-sm text-primary hover:underline">
          {t('error.notfound.back')}
        </Link>
      </div>
    </div>
  )
}
