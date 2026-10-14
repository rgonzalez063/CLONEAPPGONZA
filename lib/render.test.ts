import { describe, expect, it } from 'vitest'
import { toPdf, toRtf } from './render'

describe('rtf', () => {
  it('escapes control characters and non-ascii text', () => {
    const rtf = toRtf([{ kind: 'p', text: 'Price {a} \\ b — ok\nnext' }])
    expect(rtf).toContain('Price \\{a\\} \\\\ b \\u8212? ok\\line next')
    expect(rtf.startsWith('{\\rtf1')).toBe(true)
    expect(rtf.trim().endsWith('}')).toBe(true)
  })
  it('writes a table with a header row and one row per entry', () => {
    const rtf = toRtf([{ kind: 'table', head: ['A', 'B'], rows: [['1', '2'], ['3', '4']] }])
    expect((rtf.match(/\\row/g) ?? []).length).toBe(3)
    expect((rtf.match(/\\cell(?!x)/g) ?? []).length).toBe(6)
  })
})

describe('pdf', () => {
  it('writes a real multi-page PDF from blocks', async () => {
    const rows = Array.from({ length: 80 }, (_, i) => [`row ${i}`, `$${i * 100}`])
    const pdf = await toPdf([
      { kind: 'title', text: 'Title' }, { kind: 'p', text: 'A paragraph. '.repeat(100) },
      { kind: 'table', head: ['Name', 'Value'], rows }, { kind: 'h', text: 'End' },
    ], true)
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
    expect(pdf.length).toBeGreaterThan(3000)
    expect((new TextDecoder('latin1').decode(pdf).match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1)
  })
})
