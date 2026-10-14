import { describe, expect, it } from 'vitest'
import { diffEvents, eventDetail, eventTitle } from './activity'
import type { StoredProperty } from './importer'
import type { Session, WidgetState } from './types'

const w = (o: Partial<WidgetState> = {}): WidgetState => ({ chosen: null, done: false, locked: false, model: false, low: null, high: null, ...o })
const prop = (id: string, o: Partial<StoredProperty> = {}): StoredProperty => ({ id, salePrice: 200000, saleDate: '2026-05-01', contractDate: null, status: 'closed', values: { gla: 1500 }, ...o })
const session = (o: Partial<Session> = {}): Session => ({
  id: 's', name: 'A', state: 'TX', mls: 'HAR', propertyType: 'SFR', template: 'Standard', effectiveDate: '2026-06-01', createdAt: '', updatedAt: '',
  datasets: [{ slot: 1, name: 'Comps', properties: [], excludedAfterEffective: 0 }], subject: null, widgets: { gla: w() }, ...o,
})
const none = new Map<number, Map<string, StoredProperty>>()
const types = (e: { type: string }[]) => e.map((x) => x.type)

describe('diffEvents', () => {
  it('logs nothing when nothing changed', () => { expect(diffEvents(session(), session(), none)).toEqual([]) })
  it('logs a rename', () => {
    const e = diffEvents(session(), session({ name: 'B' }), none)
    expect(e).toEqual([{ type: 'session.renamed', detail: { from: 'A', to: 'B' } }])
  })
  it('logs choosing, changing and clearing an adjustment', () => {
    const chosen = diffEvents(session(), session({ widgets: { gla: w({ chosen: 43 }) } }), none)
    expect(chosen[0]).toMatchObject({ type: 'adjustment.chosen', detail: { value: 43, was: null } })
    const cleared = diffEvents(session({ widgets: { gla: w({ chosen: 43 }) } }), session(), none)
    expect(types(cleared)).toEqual(['adjustment.cleared'])
  })
  it('logs done, lock and model toggles', () => {
    const e = diffEvents(session(), session({ widgets: { gla: w({ done: true, locked: true, model: true }) } }), none)
    expect(types(e)).toEqual(['feature.done', 'feature.locked', 'model.on'])
  })
  it('logs features added, removed and reordered', () => {
    const a = session({ widgets: { gla: w(), lot_size: w() } })
    expect(types(diffEvents(session(), a, none))).toEqual(['feature.added'])
    expect(types(diffEvents(a, session(), none))).toEqual(['feature.removed'])
    const flipped = session({ widgets: { lot_size: w(), gla: w() } })
    expect(types(diffEvents(a, flipped, none))).toEqual(['features.reordered'])
  })
  it('logs sales added, dropped and cleared', () => {
    const before = new Map([[1, new Map([['1', prop('1')], ['2', prop('2')]])]])
    const was = session({ datasets: [{ slot: 1, name: 'Comps', properties: [prop('1'), prop('2')], excludedAfterEffective: 0 }] })
    const grown = session({ datasets: [{ slot: 1, name: 'Comps', properties: [prop('1'), prop('3')], excludedAfterEffective: 0 }] })
    expect(types(diffEvents(was, grown, before))).toEqual(['dataset.sales_added', 'dataset.sales_dropped'])
    expect(types(diffEvents(was, session(), before))).toEqual(['dataset.cleared'])
  })
  it('logs removing, recovering and editing a sale', () => {
    const a = prop('1')
    const before = new Map([[1, new Map([['1', a]])]])
    const was = session({ datasets: [{ slot: 1, name: 'Comps', properties: [a], excludedAfterEffective: 0 }] })
    const set = (p: StoredProperty) => session({ datasets: [{ slot: 1, name: 'Comps', properties: [p], excludedAfterEffective: 0 }] })
    expect(types(diffEvents(was, set({ ...a, deleted: true }), before))).toEqual(['sales.removed'])
    const edited = { ...a, values: { gla: 1600 }, edits: { gla: { from: 1500, to: 1600 } } }
    expect(diffEvents(was, set(edited), before)[0]).toMatchObject({ type: 'sale.edited', detail: { mls: '1', field: 'gla', from: 1500, to: 1600 } })
    const b2 = new Map([[1, new Map([['1', { ...a, deleted: true }]])]])
    expect(types(diffEvents(set({ ...a, deleted: true }), set(a), b2))).toEqual(['sales.recovered'])
    const b3 = new Map([[1, new Map([['1', edited]])]])
    expect(types(diffEvents(set(edited), set(a), b3))).toEqual(['sale.edit_undone'])
  })
  it('caps the edits listed in one save', () => {
    const olds = Array.from({ length: 40 }, (_, i) => prop(String(i)))
    const news = olds.map((p) => ({ ...p, edits: { gla: { from: 1500, to: 1600 } } }))
    const before = new Map([[1, new Map(olds.map((p) => [p.id, p]))]])
    const e = diffEvents(session({ datasets: [{ slot: 1, name: 'C', properties: olds, excludedAfterEffective: 0 }] }), session({ datasets: [{ slot: 1, name: 'C', properties: news, excludedAfterEffective: 0 }] }), before)
    expect(e.filter((x) => x.type === 'sale.edited')).toHaveLength(30)
    expect(e.find((x) => x.type === 'sale.edited_more')?.detail.more).toBe(10)
  })
})

describe('how events read', () => {
  it('has a title for each known type and a fallback', () => {
    expect(eventTitle('sales.removed')).toBe('Sales removed')
    expect(eventTitle('odd.thing_here')).toBe('odd thing here')
  })
  it('writes details in plain words', () => {
    expect(eventDetail('adjustment.chosen', { feature: 'GLA', value: 43, was: null })).toBe('GLA: $43.00')
    expect(eventDetail('session.renamed', { from: 'A', to: 'B' })).toBe('A to B')
    expect(eventDetail('sales.removed', { dataset: 'Comps', count: 2, mls: '1, 2' })).toBe('Comps: 2 (MLS 1, 2)')
  })
})
