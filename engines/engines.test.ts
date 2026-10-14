import { describe, expect, it } from 'vitest'
import { findPairs, groupedData, pairedSales, regression, sensitivity } from './methods'
import { modelPrices } from './modeling'
import { median, ols, theilSen, trimIQR } from './stats'
import type { FeatureDef, Property } from './types'

const gla: FeatureDef = { key: 'gla', label: 'GLA', unit: 'sqft', get: (p) => p.values.gla ?? null, rule: { type: 'pct', pct: 5 } }
const baths: FeatureDef = { key: 'baths', label: 'Baths', unit: 'each', get: (p) => p.values.baths ?? null, rule: { type: 'exact' } }
const prop = (id: string, price: number, values: Record<string, number | null>): Property => ({ id, price, values })

describe('textbook examples', () => {
  it('Theil-Sen: slopes 100, 50, 75 -> 75', () => {
    const r = theilSen([2000, 2100, 1900], [200000, 210000, 195000])
    expect(r!.slope).toBe(75)
  })
  it('sensitivity picks the candidate with the smallest range ($85)', () => {
    const props = [
      prop('1', 200000, { gla: 2075 }), prop('2', 185000, { gla: 1900 }), prop('3', 206000, { gla: 2150 }),
    ]
    const r = sensitivity(props, gla, 2000, { min: 75, max: 90, step: 5, trimPct: 0 })
    expect(r.value).toBe(85)
    expect(r.detail!.range).toBe(375)
  })
  it('paired sales: only properties that differ in the studied feature pair up', () => {
    const props = [
      prop('A', 300000, { gla: 2500, baths: 2 }), prop('B', 310000, { gla: 2600, baths: 2 }),
      prop('C', 305000, { gla: 2500, baths: 2 }),
    ]
    // GLA tolerance 0% for this test: 2500 vs 2600 differ; A and C are the same size, so no pair
    const strict: FeatureDef = { ...gla, rule: { type: 'exact' } }
    const pairs = findPairs(props, strict, [strict, baths])
    expect(pairs.map((p) => p.rate).sort((a, b) => a - b)).toEqual([50, 100])
    const res = pairedSales(props, strict, [strict, baths])
    expect(res.find((r) => r.variant === 'avg')!.value).toBe(75)
  })
  it('OLS and IQR trim behave', () => {
    const o = ols([1, 2, 3, 4], [2, 4, 6, 8])!
    expect(o.slope).toBeCloseTo(2)
    expect(o.r2).toBeCloseTo(1)
    expect(trimIQR([1, 2, 3, 4, 5, 6, 7, 8, 100])).not.toContain(100)
    expect(median([1, 3, 2])).toBe(2)
  })
})

describe('synthetic market with a known $50/sqft GLA effect', () => {
  // deterministic pseudo-noise
  let s = 7
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5)
  const props = Array.from({ length: 120 }, (_, i) => {
    const g = 1300 + Math.round((i % 40) * 20)
    return prop(`p${i}`, 100000 + 50 * g + rnd() * 6000, { gla: g, baths: 2 })
  })
  it('regression recovers the slope', () => {
    const r = regression(props, gla)
    expect(r.find((x) => x.method === 'OLS')!.value).toBeGreaterThan(47)
    expect(r.find((x) => x.method === 'OLS')!.value).toBeLessThan(53)
    expect(Math.abs(r.find((x) => x.method === 'TS')!.value! - 50)).toBeLessThan(3)
  })
  it('sensitivity recovers the slope', () => {
    const r = sensitivity(props, gla, 1700, { min: 0, max: 120, step: 1 })
    expect(Math.abs(r.value! - 50)).toBeLessThan(4)
  })
  it('grouped data recovers the slope', () => {
    const r = groupedData(props, gla, { from: 1300, to: 1500 }, { from: 1900, to: 2100 }, 'avg')
    expect(Math.abs(r.value! - 50)).toBeLessThan(4)
  })
  it('reports no result when a group is too small', () => {
    const r = groupedData(props, gla, { from: 0, to: 10 }, { from: 1900, to: 2100 }, 'avg')
    expect(r.status).toBe('no_result')
    expect(r.reason).toMatch(/minimum 2/)
  })
})

describe('match rules', () => {
  const g = (rule: FeatureDef['rule']): FeatureDef => ({ ...gla, rule })
  const pairsFor = (rule: FeatureDef['rule']) =>
    findPairs([prop('a', 100, { gla: 1500 }), prop('b', 110, { gla: 1590 })], g({ type: 'exact' }), [g(rule)]).length
  it('abs: sizes within a number of units count as the same, so they do not pair on that feature', () => {
    // studied feature uses exact here; the rule under test is applied to the studied feature only through its own def
    const same = (rule: FeatureDef['rule']) => findPairs([prop('a', 100, { gla: 1500, x: 1 }), prop('b', 110, { gla: 1590, x: 1 })], g(rule), [g(rule)]).length
    expect(same({ type: 'abs', tol: 100 })).toBe(0) // 90 sqft apart is "the same" within 100
    expect(same({ type: 'abs', tol: 50 })).toBe(1) // 90 sqft apart differs when the tolerance is 50
    expect(pairsFor({ type: 'exact' })).toBe(1)
  })
})

describe('modeling', () => {
  it('moves prices to the subject by the decided rate', () => {
    const props = [prop('a', 200000, { gla: 1900 })]
    const out = modelPrices(props, [{ feature: gla, rate: 50 }], { gla: 2000 })
    expect(out[0].price).toBe(205000)
  })
})
