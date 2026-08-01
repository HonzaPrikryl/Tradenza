// Mapping between stored image URLs and R2 object keys.
//
// Uploads land under a flat per-user prefix (`notes/{userId}/{uuid}.{ext}` — see
// uploadNoteImage), so an object cannot be attributed to a trade or an account
// by its key alone. The only way to know what an object belongs to is to look at
// which field still references its URL, which is what these helpers feed.
//
// Kept free of the S3 SDK so it stays cheap to import and to test.

/** Public base URL for R2 objects, without a trailing slash. `null` when unset. */
function publicBase(): string | null {
  const base = process.env.R2_PUBLIC_URL
  return base ? base.replace(/\/$/, '') : null
}

/**
 * Object key for a stored image URL, or `null` if the URL doesn't point at our
 * bucket (inline data: URLs from the R2-less fallback, or anything external —
 * neither is ours to delete).
 */
export function r2KeyFromUrl(url: string | null | undefined): string | null {
  const base = publicBase()
  if (!base || !url) return null
  if (!url.startsWith(`${base}/`)) return null
  // Drop any query/fragment; keys never contain either.
  const key = url.slice(base.length + 1).replace(/[?#].*$/, '')
  return key && !key.includes('..') ? key : null
}

/** Object keys for every `<img>` in a rich-text field that points at our bucket. */
export function r2KeysFromHtml(html: string | null | undefined): string[] {
  if (!html) return []
  const keys: string[] = []
  for (const [, src] of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    const key = r2KeyFromUrl(src.replace(/&amp;/g, '&'))
    if (key) keys.push(key)
  }
  return keys
}
