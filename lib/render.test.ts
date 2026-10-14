import { describe, expect, it } from 'vitest'
import { toRtf } from './render'

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
