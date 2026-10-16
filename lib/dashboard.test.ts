import { describe, expect, it } from 'vitest'
import type { PreparedDataset } from './analysis'
import { counts, histogram, mostSimilar, propertyMetrics, sessionMetrics, stats } from './dashboard'
import type { Session } from './types'

describe('basic figures', () => {
  it('summarizes a list of numbers and ignores gaps', () => {
    expect(stats([1, 2, 3, 4, null, undefined])).toEqual({ n: 4, min: 1, q1: 1.75, median: 2.5, q3: 3.25, max: 4, mean: 2.5 })
    expect(stats([null])).toBeNull()
  })
  it('bins values evenly and counts every one', () => {
    const b = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)
    expect(b).toHaveLength(5)
    expect(b.reduce((a, x) => a + x.count, 0)).toBe(11)
    expect(b[4].count).toBe(3) // the largest value lands in the last bin
    expect(histogram([5, 5, 5])).toEqual([{ lo: 5, hi: 5, count: 3 }])
  })
  it('counts whole values', () => { expect(counts([2, 3, 2, null, 2])).toEqual([{ value: 2, count: 3 }, { value: 3, count: 1 }]) })
})

const prop = (id: string, price: number, gla: number, lot: number, age: number) => ({ id, price, values: { gla, lot_size: lot, age, beds: 3, baths_full: 2, garage: 2 } as Record<string, number | null> })
const prepared = [{ slot: 1, name: 'Close', props: [prop('a', 250000, 1500, 6000, 30), prop('b', 300000, 2000, 7000, 10), prop('c', 240000, 1450, 6100, 35)], report: { timeModel: 'linear', trend: { coefficients: [30, 200000], r2: 0.4 }, removed: {} }, excludedAfterEffective: 2 }] as unknown as PreparedDataset[]
const session = {
  id: 's', name: 'x', effectiveDate: '2026-10-09',
  subject: { address: 'a', zip: '77449', gla: 1480, lot_size: 6000, baths_full: 2, baths_half: 0, stories: 1, garage: 2 },
  datasets: [{ slot: 1, name: 'Close', excludedAfterEffective: 2, properties: [
    { id: 'a', salePrice: 250000, saleDate: '2026-07-01', meta: { concessions: 3000 } }, { id: 'b', salePrice: 300000, saleDate: '2026-07-20' }, { id: 'c', salePrice: 240000, saleDate: '2026-08-02' }, { id: 'd', salePrice: 1, saleDate: '2026-08-02', deleted: true },
  ] }],
  widgets: { gla: { chosen: 60, done: true, locked: true, model: false, low: null, high: null }, lot_size: { chosen: null, done: false, locked: false, model: false, low: null, high: null } },
} as unknown as Session

describe('property metrics', () => {
  it('gives each dataset its price, size and month figures, ignoring removed sales', () => {
    const [m] = propertyMetrics(session, prepared)
    expect(m).toMatchObject({ n: 3, concessionPct: 100 / 3 })
    expect(m.price?.median).toBe(250000)
    expect(m.gla?.max).toBe(2000)
    expect(m.byMonth).toEqual([{ month: '2026-07', sales: 2, medianPrice: 275000 }, { month: '2026-08', sales: 1, medianPrice: 240000 }])
    expect(m.points).toHaveLength(3)
  })
  it('ranks the sales most like the subject first', () => {
    const r = mostSimilar(session, prepared, 2)
    expect(r.map((x) => x.id)).toEqual(['a', 'c'])
    expect(r[0].distance).toBeLessThan(r[1].distance)
  })
})

describe('session metrics', () => {
  const computed = { gla: [{ slot: 1, name: 'Close', count: 3, results: [
    { method: 'OLS', variant: '', value: 40, mae: 1, status: 'ok' }, { method: 'TS', variant: '', value: 80, mae: 1, status: 'ok' }, { method: 'LAD', variant: '', value: null, mae: null, status: 'no_result' },
  ] }] } as never
  it('shows progress, the range of results and whether the chosen value is inside it', () => {
    const m = sessionMetrics(session, prepared, computed)
    expect(m.done).toBe(1)
    expect(m.total).toBe(2)
    expect(m.features[0]).toMatchObject({ key: 'gla', chosen: 60, results: 2, low: 40, high: 80, median: 60, insideRange: true })
    expect(m.features[1]).toMatchObject({ chosen: null, results: 0, insideRange: null })
    expect(m.data.datasets[0]).toEqual({ name: 'Close', loaded: 3, kept: 3, removed: 0, afterEffective: 2 })
    expect(m.data.trend[0].changePerMonthPct).toBeCloseTo((30 * 30.44) / (790000 / 3) * 100, 6)
  })
})
