import { describe, it, expect } from 'vitest'
import { isEmptyHtml } from './html'

describe('isEmptyHtml', () => {
  it('treats blank / tag-only markup as empty', () => {
    expect(isEmptyHtml('')).toBe(true)
    expect(isEmptyHtml('   ')).toBe(true)
    expect(isEmptyHtml('<p></p>')).toBe(true)
    expect(isEmptyHtml('<p><br></p>')).toBe(true)
    expect(isEmptyHtml('&nbsp;')).toBe(true)
    expect(isEmptyHtml('<div><p>&nbsp;</p></div>')).toBe(true)
  })

  it('treats real text as non-empty', () => {
    expect(isEmptyHtml('<p>hello</p>')).toBe(false)
    expect(isEmptyHtml('<ul><li>a</li></ul>')).toBe(false)
    expect(isEmptyHtml('plain')).toBe(false)
  })

  it('treats image-only content as non-empty', () => {
    expect(isEmptyHtml('<img src="x.png">')).toBe(false)
    expect(isEmptyHtml('<p><img src="x.png"></p>')).toBe(false)
    expect(isEmptyHtml('<IMG SRC="x.png">')).toBe(false)
  })
})
