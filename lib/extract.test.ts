import { describe, expect, it } from 'vitest'
import { toListings, toProperties, toSubject, type MarketRow, type SaleRow, type SubjectScan } from './extract'

const f = <T,>(value: T | null, evidence = '') => ({ value, evidence })
const scan = (o: Partial<SubjectScan['fields']> = {}): SubjectScan => ({
  documentType: 'listing sheet', notes: '',
  fields: {
    address: f('22531 John Rolfe Ln'), city: f('Katy'), state: f('TX'), zip: f('77449-3600'), gla: f(1447), lotSize: f(6300), bedrooms: f(3), bathsFull: f(2), bathsHalf: f(0),
    stories: f(1), garage: f(2), yearBuilt: f(1985), quality: f('q3'), condition: f('C3'), effectiveDate: f('10/09/2026'), ...o,
  },
})
const sale = (o: Partial<SaleRow> = {}): SaleRow => ({
  mlsNumber: '1001', address: '1 A St', status: 'Closed', salePrice: 250000, saleDate: '2026-07-01', contractDate: '2026-06-01', listPrice: 255000, gla: 1500, lotSize: 6000,
  bedrooms: 3, bathsFull: 2, bathsHalf: 0, garage: 2, stories: 1, yearBuilt: 1990, pool: false, concessions: 3000, financing: 'Conventional', confidence: 'high', note: '', ...o,
})

describe('subject scan', () => {
  it('becomes subject form values, with the address put together and the zip trimmed', () => {
    const r = toSubject(scan())
    expect(r.subject).toMatchObject({ address: '22531 John Rolfe Ln, Katy TX 77449-3600', zip: '77449', gla: 1447, lot_size: 6300, baths_full: 2, baths_half: 0, stories: 1, garage: 2, quality: 'Q3', condition: 'C3' })
    expect(r.effectiveDate).toBe('2026-10-09')
  })
  it('drops impossible numbers and invalid ratings instead of using them', () => {
    const r = toSubject(scan({ gla: f(14), lotSize: f(-5), quality: f('great'), condition: f('C9'), stories: f(40) }))
    expect(r.subject.gla).toBeUndefined()
    expect(r.subject.lot_size).toBeUndefined()
    expect(r.subject.quality).toBeUndefined()
    expect(r.subject.condition).toBeUndefined()
    expect(r.subject.stories).toBeUndefined()
    expect(r.filled).toContain('baths_full')
  })
  it('leaves out what was not found', () => {
    const r = toSubject(scan({ address: f(null), city: f(null), state: f(null), zip: f(null), gla: f(null) }))
    expect(r.subject.address).toBeUndefined()
    expect(r.subject.gla).toBeUndefined()
  })
})

describe('sales scan', () => {
  it('becomes stored properties with the same values the CSV import makes', () => {
    const { properties, problems } = toProperties([sale(), sale({ mlsNumber: '1002', saleDate: '07/15/2026', pool: true, yearBuilt: 2000 })], '2026-10-09')
    expect(problems).toEqual([])
    expect(properties[0]).toMatchObject({ id: '1001', salePrice: 250000, saleDate: '2026-07-01', contractDate: '2026-06-01', status: 'closed' })
    expect(properties[0].values).toMatchObject({ gla: 1500, lot_size: 6000, baths_full: 2, garage: 2, beds: 3, pool: 0, age: 36, year_built: 1990 })
    expect(properties[0].meta).toEqual({ concessions: 3000, financing: 'Conventional', special: '', ownership: '' })
    expect(properties[1]).toMatchObject({ saleDate: '2026-07-15' })
    expect(properties[1].values).toMatchObject({ pool: 1, age: 26 })
  })
  it('sets aside rows that cannot be used and says why', () => {
    const { properties, problems } = toProperties([
      sale({ salePrice: null }), sale({ mlsNumber: '2', saleDate: null }), sale({ mlsNumber: null, address: null }), sale({ mlsNumber: '1001' }), sale({ mlsNumber: '1001' }),
      sale({ mlsNumber: '3', saleDate: '2026-12-01' }), sale({ mlsNumber: '4', salePrice: 12 }),
    ], '2026-10-09')
    expect(properties.map((p) => p.id)).toEqual(['1001'])
    expect(problems.map((p) => [p.index, p.reason])).toEqual([
      [0, 'No usable sale price.'], [1, 'No usable sale date.'], [2, 'No MLS number or address to identify it.'], [4, 'Repeats an earlier row.'], [5, 'Closed after the effective date.'], [6, 'No usable sale price.'],
    ])
  })
  it('keeps unknown values unknown, not zero', () => {
    const { properties } = toProperties([sale({ gla: null, lotSize: 12, bathsFull: null, pool: null, concessions: null, yearBuilt: null })], '2026-10-09')
    expect(properties[0].values).toMatchObject({ gla: null, lot_size: null, baths_full: null, pool: null, age: null })
    expect(properties[0].meta?.concessions).toBe(0)
  })
})

describe('market scan', () => {
  const row = (o: Partial<MarketRow> = {}): MarketRow => ({
    mlsNumber: 'A1', address: null, status: 'Active', listDate: '2026-09-01', origListPrice: 250000, listPrice: 245000, soldPrice: null, closeDate: null, contractDate: null, offMarketDate: null,
    withdrawnDate: null, expirationDate: null, terminationDate: null, gla: 1500, lotSize: 6000, yearBuilt: 1990, dom: 10, concessions: null, specialConditions: 'REO', confidence: 'high', note: '', ...o,
  })
  it('becomes listings the market screen reads', () => {
    const { listings, problems } = toListings([row(), row({ mlsNumber: 'S1', status: 'Sold', soldPrice: 240000, closeDate: '2026-09-20', listDate: '09/01/2026' })])
    expect(problems).toEqual([])
    expect(listings[0]).toMatchObject({ id: 'A1', status: 'Active', listPrice: 245000, special: 'REO' })
    expect(listings[1]).toMatchObject({ id: 'S1', soldPrice: 240000, closeDate: '2026-09-20', listDate: '2026-09-01' })
  })
  it('sets aside rows with no id, status or list date', () => {
    const { listings, problems } = toListings([row({ mlsNumber: null }), row({ mlsNumber: 'B', status: null }), row({ mlsNumber: 'C', listDate: 'soon' }), row({ mlsNumber: 'D' })])
    expect(listings.map((l) => l.id)).toEqual(['D'])
    expect(problems.map((p) => p.index)).toEqual([0, 1, 2])
  })
})
