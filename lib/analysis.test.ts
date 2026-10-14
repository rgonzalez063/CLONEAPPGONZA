import { describe, expect, it } from 'vitest'
import { depreciatedCostResult, groupAnalyses } from './analysis'
import type { Session } from './types'

const pairs = (a: ReturnType<typeof groupAnalyses>) => a.map(([x, y]) => [x.from, x.to, y.from, y.to])

// Group boundaries printed in a Synapse settings page for a real session (medians from its first dataset).
describe('grouped data analyses', () => {
  it('sizes: 10% either side of the median, then the overlapping 3% pair', () => {
    expect(pairs(groupAnalyses('sqft', 1574, 1100))).toEqual([[1417, 1574, 1574, 1731], [1417, 1621, 1527, 1731]])
    expect(pairs(groupAnalyses('sqft', 6303, 1000))).toEqual([[5673, 6303, 6303, 6933], [5673, 6492, 6114, 6933]])
  })
  it('years round to the nearest half year', () => {
    expect(pairs(groupAnalyses('years', 39.5, 1))).toEqual([[35.5, 39.5, 39.5, 43.5], [35.5, 40.5, 38.5, 43.5]])
  })
  it('counts: one below the median against the median, then the median against one above', () => {
    expect(pairs(groupAnalyses('each', 2, 0))).toEqual([[1, 1, 2, 2], [2, 2, 3, 3]])
  })
  it('counts at the bottom of the range have no "below": both analyses use the median and one above', () => {
    expect(pairs(groupAnalyses('each', 0, 0))).toEqual([[0, 0, 1, 1], [0, 0, 1, 1]])
  })
  it('yes/no features compare without against with, once', () => {
    expect(pairs(groupAnalyses('yes/no', 0, 0))).toEqual([[0, 0, 1, 1]])
  })
})

describe('depreciated cost from the subject', () => {
  const base = { id: 's', name: 'x', datasets: [], widgets: {}, subject: { address: 'a', zip: '', gla: 1447, lot_size: null, baths_full: null, baths_half: null, stories: null, garage: null, quality: 'Q3', effectiveAge: 15, costPerSqft: 195.56, costChangePerStep: -0.85, kitchenPct: 10.35 } } as unknown as Session
  it('gives $134 for the numbers on the real GLA page', () => {
    expect(Math.round(depreciatedCostResult(base, 'gla')!.value!)).toBe(134)
  })
  it('uses the condition table when no effective age is typed', () => {
    const s = { ...base, subject: { ...base.subject!, effectiveAge: null, condition: 'C3' } } as Session
    expect(depreciatedCostResult(s, 'gla')!.detail!.effectiveAge).toBe(14)
  })
  it('gives nothing without a cost or for features other than GLA', () => {
    expect(depreciatedCostResult({ ...base, subject: { ...base.subject!, costPerSqft: null } } as Session, 'gla')).toBeNull()
    expect(depreciatedCostResult(base, 'lot_size')).toBeNull()
  })
})
