import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { StoredProperty } from './importer'
import { financingOf, placeComps, proximity, saleTypeOf } from './totalComps'
import { fillTotalXml } from './totalXml'

const sale = (id: string, over: Partial<StoredProperty> = {}): StoredProperty => ({
  id, salePrice: 250000, saleDate: '2026-07-20', contractDate: '2026-06-15', status: 'closed',
  values: { gla: 1700, lot_size: 7150, baths_full: 2, baths_half: 1, garage: 2, carport: 0, beds: 4, rooms: 7, age: 35 },
  text: { address: '2607 Anthony Hay Ln', city: 'Katy', zip: '77449', dom: '5', lat: '29.8112902', lng: '-95.7659234' },
  meta: { concessions: 10000, financing: 'Conventional', special: '', ownership: '' }, ...over,
})
const col = (seq: number, extra = '') => `<COMPARABLE_SALE PropertySequenceIdentifier="${seq}" PropertySalesAmount="1" DataSourceDescription="old" SalePriceTotalAdjustmentAmount="-5">
<LOCATION LatitudeNumber="${seq === 0 ? '29.806256' : '1'}" LongitudeNumber="${seq === 0 ? '-95.7632517' : '1'}" PropertyStreetAddress="old" />
<ROOM_ADJUSTMENT TotalRoomCount="6" />
<SALE_PRICE_ADJUSTMENT _Type="FinancingConcessions" _Description="FHA;1" _Amount="-9" />
<SALE_PRICE_ADJUSTMENT _Type="DateOfSale" _Description="s01/01;c01/01" _Amount="" />
<SALE_PRICE_ADJUSTMENT _Type="GrossLivingArea" _Description="1" _Amount="+5" />
<SALE_PRICE_ADJUSTMENT _Type="Quality" _Description="Q4" _Amount="" />
<OTHER_FEATURE_ADJUSTMENT PropertyFeatureSequenceIdentifier="1" PropertyFeatureDescription="FENCE" PropertyFeatureAdjustmentAmount="300" />
<COMPARISON_DETAIL GSEDataSourceDescription="x" GSEDaysOnMarketDescription="1" GSESaleType="a" GSEFinancingType="FHA" GSEConcessionAmount="1" />
<OFFERING_DISPOSITION GSEShortDateDescription="01/01" /><OFFERING_DISPOSITION GSEShortDateDescription="01/01" />${extra}
</COMPARABLE_SALE>`
const subjectCol = col(0).replace(/ SalePriceTotalAdjustmentAmount="-5"/, '').replace(/ _Amount="[^"]+"/g, ' _Amount=""').replace(/PropertyFeatureAdjustmentAmount="300"/, 'PropertyFeatureAdjustmentAmount=""')
const xml = `<VALUATION_RESPONSE><PROPERTY _State="TX"></PROPERTY><SALES_COMPARISON>${subjectCol}${col(1)}</SALES_COMPARISON><VALUATION AppraisalEffectiveDate="2026-10-09"/></VALUATION_RESPONSE>`
const opt = { mlsName: 'HARMLS', effectiveDate: '2026-10-09', state: 'TX' }

describe('placeComps', () => {
  const r = placeComps(xml, [sale('111'), sale('222', { salePrice: 300000 })], opt)
  it('updates an existing column and adds a new one', () => {
    expect(r.placed.map((p) => [p.seq, p.created])).toEqual([[1, false], [2, true]])
    expect((r.xml.match(/<COMPARABLE_SALE /g) ?? []).length).toBe(3)
    expect(r.xml).toContain('PropertySequenceIdentifier="2" PropertySalesAmount="300000"')
  })
  it('writes UAD wording', () => {
    expect(r.xml).toContain('DataSourceDescription="HARMLS #111;DOM 5"')
    expect(r.xml).toContain('_Description="Conv;10000"')
    expect(r.xml).toContain('_Description="s07/26;c06/26"')
    expect(r.xml).toContain('TotalBathroomCount="2.5"')
    expect(r.xml).toContain('PropertyStreetAddress2="Katy, TX 77449"')
    expect(r.xml).toMatch(/ProximityToSubjectDescription="0\.\d\d miles NW"/)
  })
  it('clears old dollar amounts and totals but keeps the rows the app does not know', () => {
    expect(r.xml).not.toContain('SalePriceTotalAdjustmentAmount')
    expect(r.xml).not.toMatch(/_Amount="(-9|\+5)"/)
    expect(r.xml).toContain('PropertyFeatureAdjustmentAmount=""')
    expect(r.xml).toContain('_Type="Quality" _Description="Q4"')
    expect(r.warnings.join(' ')).toMatch(/copied from comparable 1/)
  })
  it('can be followed by the adjustment fill', () => {
    const f = fillTotalXml({ xml: r.xml, rates: { gla: 20 }, subject: { gla: 1500 }, comps: new Map([['111', { gla: 1700 }], ['222', { gla: 1700 }]]), options: { roundTo: 1, dropEmbeddedPdf: false, market: null } })
    expect(f.comps.map((c) => c.total)).toEqual([-4000, -4000])
    expect(f.xml).toContain('AdjustedSalesPriceAmount="246000"')
  })
  it('explains what is missing', () => {
    expect(() => placeComps('<a/>', [sale('1')], opt)).toThrow(/TOTAL/)
    expect(() => placeComps(`<SALES_COMPARISON>${subjectCol}</SALES_COMPARISON>`, [sale('1')], opt)).toThrow(/at least one comparable/)
    expect(placeComps(xml, [sale('9', { text: {} })], opt).warnings.join(' ')).toMatch(/no street address/)
  })
})

describe('translations', () => {
  it('maps financing and sale type', () => {
    expect(financingOf('FHA')).toMatchObject({ short: 'FHA', gse: 'FHA' })
    expect(financingOf('Cash').short).toBe('Cash')
    expect(financingOf('Seller Financing').gse).toBe('Other')
    expect(saleTypeOf('REO').gse).toBe('REOSale')
    expect(saleTypeOf('').short).toBe('ArmLth')
  })
  it('gives distance and direction', () => {
    expect(proximity([29.806256, -95.7632517], [29.8112902, -95.7659234])).toBe('0.38 miles NW')
    expect(proximity(null, [1, 1])).toBe('')
  })
})

const real = '.sample/john/total.xml'
describe.skipIf(!existsSync(real))('real TOTAL file', () => {
  it('places three sales into the John Rolfe report', () => {
    const r = placeComps(readFileSync(real, 'utf8'), [sale('1'), sale('2'), sale('3'), sale('4'), sale('5'), sale('6')], opt)
    expect(r.placed).toHaveLength(6)
    expect(r.xml).toContain('HARMLS #6;DOM 5')
  })
})
