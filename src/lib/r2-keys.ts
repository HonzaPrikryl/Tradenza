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

/**
 * Whether an object key sits under this user's own upload prefix.
 *
 * Uploads land in `notes/{userId}/…`, so the key alone answers "is this already
 * mine?". Import uses it to reference an image instead of duplicating it when a
 * journal moves between one user's own accounts — orphan cleanup scans
 * everything that user owns, so a second reference is enough to keep the object
 * alive, and copying would silently double their storage on every import.
 */
export function r2KeyBelongsTo(key: string | null | undefined, userId: string): boolean {
  return !!key && !!userId && key.startsWith(`notes/${userId}/`)
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

/**
 * Repoint every `<img>` in a rich-text field at a replacement URL.
 *
 * Used when a note changes owner (import): the images it embeds are copied to
 * the receiving user's prefix, and the note has to point at the copies. Only
 * sources that resolve to one of our own keys are considered — external images
 * and inline `data:` URLs are left exactly as they are, and any key the caller
 * has no replacement for keeps its original URL.
 */
export function rewriteHtmlImageUrls(
  html: string | null | undefined,
  replacement: (key: string) => string | undefined,
): string | null {
  if (!html) return html ?? null
  return html.replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi, (match, prefix, quote, src) => {
    const key = r2KeyFromUrl(String(src).replace(/&amp;/g, '&'))
    const next = key ? replacement(key) : undefined
    return next ? `${prefix}${quote}${next}${quote}` : match
  })
}
