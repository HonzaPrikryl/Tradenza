import type { MetadataRoute } from 'next'
import { t } from '@/i18n'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tradenza',
    short_name: 'Tradenza',
    description: t('meta.manifestDescription'),
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0c1930',
    theme_color: '#0c1930',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }
}
