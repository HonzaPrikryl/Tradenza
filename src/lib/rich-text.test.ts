import { describe, it, expect } from 'vitest'
import { sanitizeRichText } from './rich-text'

describe('sanitizeRichText', () => {
  it('strips hard-coded colors so text follows the theme', () => {
    expect(sanitizeRichText('<p style="color: rgb(0, 0, 0)">hi</p>')).toBe('<p>hi</p>')
    expect(sanitizeRichText('<span style="color:#000;background-color:#fff">hi</span>')).toBe('<span>hi</span>')
    expect(sanitizeRichText('<p style="COLOR: black; text-align: center">hi</p>')).toBe(
      '<p style="text-align: center">hi</p>',
    )
  })

  it('strips font and background declarations but keeps image layout', () => {
    expect(sanitizeRichText('<p style="font-family: Calibri; font-size: 11pt">x</p>')).toBe('<p>x</p>')
    expect(sanitizeRichText('<img src="/a.png" style="width: 50%; height: auto; float: left">')).toBe(
      '<img src="/a.png" style="width: 50%; height: auto; float: left" />',
    )
  })

  it('unwraps <font> and other legacy color carriers', () => {
    expect(sanitizeRichText('<font color="#000000" face="Arial">text</font>')).toBe('text')
  })

  it('removes scripts, handlers and dangerous URLs', () => {
    expect(sanitizeRichText('<p>a</p><script>alert(1)</script>')).toBe('<p>a</p>')
    expect(sanitizeRichText('<img src="x" onerror="alert(1)">')).toBe('<img src="x" />')
    expect(sanitizeRichText('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeRichText('<a href="&#106;avascript:alert(1)">x</a>')).toBe('<a>x</a>')
    expect(sanitizeRichText('<p onclick="alert(1)">a</p>')).toBe('<p>a</p>')
    expect(sanitizeRichText('<iframe src="https://evil.test"></iframe>')).toBe('')
    expect(sanitizeRichText('<style>body{display:none}</style><p>a</p>')).toBe('<p>a</p>')
  })

  it('keeps safe links and hardens them', () => {
    expect(sanitizeRichText('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer nofollow">x</a>',
    )
    expect(sanitizeRichText('<a href="mailto:a@b.cz">x</a>')).toContain('href="mailto:a@b.cz"')
  })

  it('keeps inline images by default and drops non-image data URLs', () => {
    expect(sanitizeRichText('<img src="data:image/png;base64,AAAA">')).toBe('<img src="data:image/png;base64,AAAA" />')
    expect(sanitizeRichText('<img src="data:text/html;base64,AAAA">')).toBe('<img />')
    expect(sanitizeRichText('<img src="data:image/png;base64,AAAA">', { allowInlineImages: false })).toBe('<img />')
  })

  it('preserves ordinary formatting markup', () => {
    const html = '<h1>T</h1><p><b>b</b> <i>i</i> <u>u</u></p><ul><li>a</li></ul><blockquote>q</blockquote>'
    expect(sanitizeRichText(html)).toBe(html)
  })

  it('escapes quotes in attribute values', () => {
    expect(sanitizeRichText('<img src="/a.png" alt="he said &quot;hi&quot;">')).toBe(
      '<img src="/a.png" alt="he said &quot;hi&quot;" />',
    )
  })

  it('handles empty input', () => {
    expect(sanitizeRichText('')).toBe('')
  })
})
