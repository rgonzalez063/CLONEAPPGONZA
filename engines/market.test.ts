import { describe, expect, it } from 'vitest'
import { activeAt, bucketOf, characteristics, concessionStats, mc1004, monthsBefore, neighborhoodSummary, periods, reoStats, suggestAssistancePrevalent, trendPctPerMonth, type Listing } from './market'

const L = (o: Partial<Listing>): Listing => ({
  id: 'x', status: 'Sold', listDate: '2026-01-01', origListPrice: 200000, listPrice: 200000, soldPrice: 190000, closeDate: '2026-02-01', contractDate: '2026-01-20', offMarketDate: null,
  withdrawnDate: null, expirationDate: null, terminationDate: null, gla: 1500, lotSize: 6000, yearBuilt: 1990, dom: 20, concessions: null, special: '', ...o,
})
const E = '2026-10-09'

describe('dates and periods', () => {
  it('counts calendar months back, clamping short months', () => {
    expect(monthsBefore('2026-10-09', 3)).toBe('2026-07-09')
    expect(monthsBefore('2026-03-31', 1)).toBe('2026-02-28')
    expect(monthsBefore('2026-10-09', 12)).toBe('2025-10-09')
  })
  it('builds the three 1004MC periods back from the effective date', () => {
    expect(periods(E).map((p) => [p.start, p.end, p.months])).toEqual([['2025-10-09', '2026-04-09', 6], ['2026-04-09', '2026-07-09', 3], ['2026-07-09', '2026-10-09', 3]])
  })
})

describe('what counts as active', () => {
  it('is on the market from the list date until it goes under contract, closes or ends', () => {
    const l = L({ status: 'Sold', listDate: '2026-05-01', contractDate: '2026-06-01', closeDate: '2026-07-01' })
    expect(activeAt(l, '2026-04-30')).toBe(false)
    expect(activeAt(l, '2026-05-15')).toBe(true)
    expect(activeAt(l, '2026-06-01')).toBe(false)
    expect(activeAt(L({ status: 'Active', listDate: '2026-09-01', closeDate: null, contractDate: null, soldPrice: null }), E)).toBe(true)
    expect(activeAt(L({ status: 'Expired', listDate: '2026-01-01', closeDate: null, contractDate: null, expirationDate: '2026-03-01', soldPrice: null }), '2026-04-01')).toBe(false)
  })
  it('does not call a sold row with no dates an open listing', () => {
    expect(activeAt(L({ status: 'Sold', closeDate: null, contractDate: null }), E)).toBe(false)
  })
  it('sorts statuses into buckets', () => {
    expect([L({ status: 'Sold' }), L({ status: 'Option Pending' }), L({ status: 'Withdrawn' }), L({ status: 'Active' })].map(bucketOf)).toEqual(['sold', 'pending', 'offmarket', 'active'])
  })
})

describe('1004MC figures', () => {
  const ls: Listing[] = [
    L({ id: 'a', closeDate: '2026-08-01', soldPrice: 200000, listPrice: 210000, dom: 10, concessions: 3000 }),
    L({ id: 'b', closeDate: '2026-09-01', soldPrice: 220000, listPrice: 220000, dom: 30 }),
    L({ id: 'c', closeDate: '2026-05-01', soldPrice: 180000, listPrice: 190000, dom: 40 }),
    L({ id: 'd', status: 'Active', closeDate: null, contractDate: null, soldPrice: null, listDate: '2026-09-15', listPrice: 250000 }),
    L({ id: 'e', status: 'Active', closeDate: null, contractDate: null, soldPrice: null, listDate: '2026-09-20', listPrice: 270000 }),
  ]
  it('counts sales, absorption, supply and medians per period', () => {
    const [old, mid, cur] = mc1004(ls, E)
    expect(old.sales).toBe(0)
    expect(mid.sales).toBe(1)
    expect(cur.sales).toBe(2)
    expect(cur.absorption).toBeCloseTo(2 / 3, 6)
    expect(cur.actives).toBe(2)
    expect(cur.monthsSupply).toBeCloseTo(3, 6)
    expect(cur.medSalePrice).toBe(210000)
    expect(cur.medDom).toBe(20)
    expect(cur.medListPrice).toBe(260000)
    expect(cur.concessionPct).toBe(50)
    expect(cur.medSaleToList).toBeCloseTo((200 / 210 * 100 + 100) / 2, 6)
    expect(old.monthsSupply).toBeNull() // no sales, no absorption
  })
  it('summarizes concessions and REO over twelve months', () => {
    const c = concessionStats(ls, E)
    expect(c).toMatchObject({ sales: 3, withConcessions: 1 })
    expect(c.amounts).toEqual({ min: 3000, max: 3000, median: 3000 })
    expect(suggestAssistancePrevalent(c)).toBe(true)
    const r = reoStats([...ls, L({ id: 'r', special: 'Real Estate Owned', closeDate: '2026-09-02' })], E)
    expect(r).toMatchObject({ reo: 1, sales: 4 })
  })
})

describe('characteristics and neighborhood', () => {
  const ls = [
    L({ id: '1', soldPrice: 200000, closeDate: '2026-08-01', yearBuilt: 1980 }), L({ id: '2', soldPrice: 205000, closeDate: '2026-08-02', yearBuilt: 1981 }),
    L({ id: '3', soldPrice: 300000, closeDate: '2026-08-03', yearBuilt: 2010 }), L({ id: '4', status: 'Expired', closeDate: null, contractDate: null, soldPrice: null, listPrice: 260000, expirationDate: '2026-06-01' }),
  ]
  it('splits listings into active, pending, sold and off market', () => {
    const c = characteristics(ls, E)
    expect(c.find((x) => x.bucket === 'sold')).toMatchObject({ n: 3, low: 200000, high: 300000, median: 205000 })
    expect(c.find((x) => x.bucket === 'offmarket')).toMatchObject({ n: 1, median: 260000 })
  })
  it('finds the predominant price and age bins', () => {
    const h = neighborhoodSummary(ls, E)
    expect(h).toMatchObject({ n: 3, priceLow: 200000, priceHigh: 300000 })
    expect(h.pricePredominant).toMatchObject({ lo: 200000, hi: 210000, count: 2 })
    expect(h.agePredominant).toMatchObject({ lo: 45, hi: 50, count: 2 })
  })
})

describe('trend', () => {
  it('is the slope as a percent of the average per month', () => {
    expect(trendPctPerMonth([100, 101, 102, 103])).toBeCloseTo((1 / 101.5) * 100, 6)
    expect(trendPctPerMonth([1, null, 2])).toBeNull() // fewer than three points
  })
})
