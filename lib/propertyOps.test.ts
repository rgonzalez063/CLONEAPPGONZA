import { describe, expect, it } from 'vitest'
import { COLUMNS, compare, editProperty, matches, revertField, setDeleted } from './propertyOps'
import type { StoredProperty } from './importer'

const col = (k: string) => COLUMNS.find((c) => c.key === k)!
const prop = (over: Partial<StoredProperty> = {}): StoredProperty => ({
  id: '100', salePrice: 200000, saleDate: '2026-05-01', contractDate: '2026-04-01', status: 'closed',
  values: { gla: 1500, lot_size: 6000, garage: 2 }, ...over,
})

describe('property edits', () => {
  it('edits a number, keeps the original, and reports it', () => {
    const r = editProperty(prop(), col('gla'), '1,650')
    expect(r.ok && r.property.values.gla).toBe(1650)
    expect(r.ok && r.property.edits).toEqual({ gla: { from: 1500, to: 1650 } })
  })
  it('keeps the first original across several edits, and drops the record when edited back', () => {
    const a = editProperty(prop(), col('gla'), '1600')
    const b = a.ok ? editProperty(a.property, col('gla'), '1700') : a
    expect(b.ok && b.property.edits).toEqual({ gla: { from: 1500, to: 1700 } })
    const c = b.ok ? editProperty(b.property, col('gla'), '1500') : b
    expect(c.ok && c.property.edits).toBeUndefined()
  })
  it('edits dates and the sale price', () => {
    const d = editProperty(prop(), col('saleDate'), '2026-06-02')
    expect(d.ok && d.property.saleDate).toBe('2026-06-02')
    const p = editProperty(prop(), col('salePrice'), '$210,000')
    expect(p.ok && p.property.salePrice).toBe(210000)
  })
  it('rejects bad input with a plain message', () => {
    expect(editProperty(prop(), col('gla'), 'abc')).toEqual({ ok: false, error: 'Enter a number.' })
    expect(editProperty(prop(), col('gla'), '1500.5')).toEqual({ ok: false, error: 'Use a whole number.' })
    expect(editProperty(prop(), col('gla'), '-5')).toEqual({ ok: false, error: 'The value cannot be negative.' })
    expect(editProperty(prop(), col('salePrice'), '0')).toMatchObject({ ok: false })
    expect(editProperty(prop(), col('saleDate'), '06/02/2026')).toEqual({ ok: false, error: 'Use the format yyyy-mm-dd.' })
    expect(editProperty(prop(), col('saleDate'), '')).toMatchObject({ ok: false })
    expect(editProperty(prop(), col('id'), 'x')).toMatchObject({ ok: false })
  })
  it('allows clearing optional values', () => {
    const r = editProperty(prop(), col('lot_size'), '')
    expect(r.ok && r.property.values.lot_size).toBeNull()
  })
  it('reverts a field to its original', () => {
    const a = editProperty(prop(), col('gla'), '1800')
    const back = a.ok ? revertField(a.property, col('gla')) : prop()
    expect(back.values.gla).toBe(1500)
    expect(back.edits).toBeUndefined()
  })
})

describe('delete, sort, search', () => {
  it('deletes and recovers by id without touching others', () => {
    const list = [prop({ id: 'a' }), prop({ id: 'b' })]
    const del = setDeleted(list, new Set(['a']), true)
    expect(del.map((p) => !!p.deleted)).toEqual([true, false])
    expect(setDeleted(del, new Set(['a']), false).every((p) => !p.deleted)).toBe(true)
  })
  it('sorts numbers numerically with empty values last in both directions', () => {
    const xs = [10, null, 2]
    expect([...xs].sort((a, b) => compare(a, b, 1))).toEqual([2, 10, null])
    expect([...xs].sort((a, b) => compare(a, b, -1))).toEqual([10, 2, null])
  })
  it('searches every shown column', () => {
    expect(matches(prop(), '1500')).toBe(true)
    expect(matches(prop(), '2026-05')).toBe(true)
    expect(matches(prop(), '1,500')).toBe(true)
    expect(matches(prop(), '$200,000')).toBe(true)
    expect(matches(prop(), 'nothing')).toBe(false)
    expect(matches(prop(), '  ')).toBe(true)
  })
})
