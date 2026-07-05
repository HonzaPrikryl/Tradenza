import type { MetadataRoute } from 'next'

// Served at /robots.txt. Points crawlers at the sitemap and keeps them out of the
// authenticated app + API (which live behind auth anyway, but this avoids wasted
// crawl budget and stray indexing attempts).
const SITE_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://tradenza.dev'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/dashboard',
        '/trades',
        '/stats',
        '/progress',
        '/accounts',
        '/add-trade',
        '/settings',
        '/trade-import',
        '/sign-in',
        '/sign-up',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
