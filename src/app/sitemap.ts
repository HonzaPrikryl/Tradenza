import type { MetadataRoute } from 'next'

// Served at /sitemap.xml. Only the publicly indexable marketing/legal pages —
// the app itself is auth-gated and intentionally excluded.
const SITE_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://tradenza.dev'

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()
  return [
    { url: `${SITE_URL}/`, lastModified, changeFrequency: 'weekly', priority: 1 },
    { url: `${SITE_URL}/privacy`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified, changeFrequency: 'yearly', priority: 0.3 },
  ]
}
