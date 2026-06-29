import { cn } from '@/lib/utils'
import { t } from '@/i18n'

type LogoVariant = 'expand' | 'icon'

const SOURCES: Record<LogoVariant, { light: string; dark: string }> = {
  expand: {
    light: '/logo/tradenza-expand-light.png',
    dark: '/logo/tradenza-expand-dark.png',
  },
  icon: {
    light: '/logo/tradenza-icon-light.png',
    dark: '/logo/tradenza-icon-dark.png',
  },
}

export default function Logo({
  variant = 'expand',
  className,
  priority = false,
}: {
  variant?: LogoVariant
  className?: string
  priority?: boolean
}) {
  const src = SOURCES[variant]
  const loading = priority ? 'eager' : 'lazy'

  return (
    <span className={cn('inline-flex items-center select-none', className)}>
      {/*
        Deliberately plain <img>: the logo is a small PNG sized by its container
        (h-full w-auto) with the light/dark variants swapped purely via CSS. A
        next/image migration would need fill + a positioned parent + sizes for no
        meaningful optimization gain, so the no-img-element rule is disabled here.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src.light}
        alt={t('meta.appName')}
        draggable={false}
        loading={loading}
        decoding="async"
        className="block h-full w-auto object-contain dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src.dark}
        alt={t('meta.appName')}
        draggable={false}
        loading={loading}
        decoding="async"
        className="hidden h-full w-auto object-contain dark:block"
      />
    </span>
  )
}
