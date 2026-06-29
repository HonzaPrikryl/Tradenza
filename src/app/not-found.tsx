import Link from 'next/link'
import { t } from '@/i18n'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center text-center px-6">
      <div>
        <p className="text-6xl font-semibold text-muted-foreground/30 mb-4">404</p>
        <h1 className="text-xl font-semibold mb-2">{t('notfound.title')}</h1>
        <p className="text-sm text-muted-foreground mb-6">{t('notfound.desc')}</p>
        <Link href="/dashboard" className="text-sm text-primary hover:underline">
          {t('notfound.back')}
        </Link>
      </div>
    </div>
  )
}
