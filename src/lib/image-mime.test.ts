import { describe, it, expect } from 'vitest'
import { sniffImageMime } from './image-mime'

const bytes = (...b: number[]) => new Uint8Array(b)

describe('sniffImageMime', () => {
  it('detects JPEG', () => {
    expect(sniffImageMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00))).toBe('image/jpeg')
  })

  it('detects PNG', () => {
    expect(sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png')
  })

  it('detects GIF', () => {
    expect(sniffImageMime(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe('image/gif')
  })

  it('detects WEBP (RIFF….WEBP)', () => {
    // "RIFF" + 4 size bytes + "WEBP"
    expect(sniffImageMime(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp')
  })

  it('rejects a renamed HTML/script payload', () => {
    // "<script>" — a classic spoof of an image upload
    const html = new TextEncoder().encode('<script>alert(1)</script>')
    expect(sniffImageMime(html)).toBeNull()
  })

  it('rejects SVG (text-based, can carry scripts)', () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">')
    expect(sniffImageMime(svg)).toBeNull()
  })

  it('rejects truncated / empty input', () => {
    expect(sniffImageMime(bytes())).toBeNull()
    expect(sniffImageMime(bytes(0xff, 0xd8))).toBeNull() // too short for JPEG
  })
})
