import { describe, it, expect, beforeEach, vi } from 'vitest'
import { r2KeyBelongsTo, r2KeyFromUrl, r2KeysFromHtml, rewriteHtmlImageUrls } from './r2-keys'

const BASE = 'https://img.example.com'

beforeEach(() => {
  vi.stubEnv('R2_PUBLIC_URL', BASE)
})

describe('r2KeyFromUrl', () => {
  it('extracts the key from a URL in our bucket', () => {
    expect(r2KeyFromUrl(`${BASE}/notes/user_1/abc.png`)).toBe('notes/user_1/abc.png')
  })

  it('tolerates a trailing slash on the configured base', () => {
    vi.stubEnv('R2_PUBLIC_URL', `${BASE}/`)
    expect(r2KeyFromUrl(`${BASE}/notes/user_1/abc.png`)).toBe('notes/user_1/abc.png')
  })

  it('ignores URLs that are not ours, so foreign images are never deleted', () => {
    expect(r2KeyFromUrl('https://evil.example.com/notes/user_1/abc.png')).toBeNull()
    expect(r2KeyFromUrl('data:image/png;base64,AAAA')).toBeNull()
    // A prefix match on the host must not be enough.
    expect(r2KeyFromUrl(`${BASE}.evil.com/notes/user_1/abc.png`)).toBeNull()
  })

  it('returns null when R2 is not configured or the URL is absent', () => {
    expect(r2KeyFromUrl(null)).toBeNull()
    vi.stubEnv('R2_PUBLIC_URL', '')
    expect(r2KeyFromUrl(`${BASE}/notes/user_1/abc.png`)).toBeNull()
  })

  it('strips a query string and rejects traversal', () => {
    expect(r2KeyFromUrl(`${BASE}/notes/user_1/abc.png?v=2`)).toBe('notes/user_1/abc.png')
    expect(r2KeyFromUrl(`${BASE}/notes/../../etc/passwd`)).toBeNull()
    expect(r2KeyFromUrl(`${BASE}/`)).toBeNull()
  })
})

describe('r2KeysFromHtml', () => {
  it('pulls every one of our images out of a note', () => {
    const html = `<p>hi</p><img src="${BASE}/notes/u/a.png"><p>x</p><img alt="b" src='${BASE}/notes/u/b.jpg'/>`
    expect(r2KeysFromHtml(html)).toEqual(['notes/u/a.png', 'notes/u/b.jpg'])
  })

  it('skips inline and external images', () => {
    const html = `<img src="data:image/png;base64,AAAA"><img src="https://other.com/x.png"><img src="${BASE}/notes/u/a.png">`
    expect(r2KeysFromHtml(html)).toEqual(['notes/u/a.png'])
  })

  it('decodes HTML-escaped ampersands in the src', () => {
    expect(r2KeysFromHtml(`<img src="${BASE}/notes/u/a.png?x=1&amp;y=2">`)).toEqual(['notes/u/a.png'])
  })

  it('returns nothing for empty or image-free notes', () => {
    expect(r2KeysFromHtml(null)).toEqual([])
    expect(r2KeysFromHtml('')).toEqual([])
    expect(r2KeysFromHtml('<p>just text</p>')).toEqual([])
  })
})

describe('rewriteHtmlImageUrls', () => {
  const html = `<p>x</p><img src="${BASE}/notes/user_1/a.png"><img src='${BASE}/notes/user_1/b.png' alt="b">`

  it('repoints our own images at their replacements', () => {
    const out = rewriteHtmlImageUrls(html, (key) => `${BASE}/notes/user_2/${key.slice(-5)}`)
    expect(out).toContain(`${BASE}/notes/user_2/a.png`)
    expect(out).toContain(`${BASE}/notes/user_2/b.png`)
    expect(out).not.toContain('user_1')
  })

  it('preserves the surrounding markup and attributes', () => {
    const out = rewriteHtmlImageUrls(html, () => `${BASE}/notes/user_2/x.png`)
    expect(out).toContain('<p>x</p>')
    expect(out).toContain('alt="b"')
  })

  it('leaves foreign and inline images alone', () => {
    const foreign = '<img src="https://cdn.other.com/x.png"><img src="data:image/png;base64,AAAA">'
    expect(rewriteHtmlImageUrls(foreign, () => `${BASE}/replaced.png`)).toBe(foreign)
  })

  it('keeps the original URL for a key with no replacement', () => {
    expect(rewriteHtmlImageUrls(html, () => undefined)).toBe(html)
  })

  it('passes empty input straight through', () => {
    expect(rewriteHtmlImageUrls(null, () => 'x')).toBeNull()
    expect(rewriteHtmlImageUrls('', () => 'x')).toBe('')
  })
})

describe('r2KeyBelongsTo', () => {
  it('recognises the user’s own upload prefix', () => {
    expect(r2KeyBelongsTo('notes/user_1/abc.png', 'user_1')).toBe(true)
  })

  it('rejects another user’s object, so it gets copied rather than shared', () => {
    expect(r2KeyBelongsTo('notes/user_2/abc.png', 'user_1')).toBe(false)
  })

  it('is not fooled by a user id that is a prefix of another', () => {
    expect(r2KeyBelongsTo('notes/user_10/abc.png', 'user_1')).toBe(false)
  })

  it('rejects a key outside the notes prefix entirely', () => {
    expect(r2KeyBelongsTo('exports/user_1/abc.png', 'user_1')).toBe(false)
  })

  it('is false for missing input', () => {
    expect(r2KeyBelongsTo(null, 'user_1')).toBe(false)
    expect(r2KeyBelongsTo('notes/user_1/a.png', '')).toBe(false)
  })
})
