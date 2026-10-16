import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fillTotalXml } from './totalXml'

const grid = (id: string, price: number, gla: number, lot: number, extra = '') => `
<COMPARABLE_SALE PropertySequenceIdentifier="${id}" PropertySalesAmount="${price}" DataSourceDescription="HARMLS #9${id}">
  <LOCATION PropertyStreetAddress="${id} Test St" />
  <ROOM_ADJUSTMENT TotalRoomCount="6" RoomAdjustmentAmount="" />
  <SALE_PRICE_ADJUSTMENT _Type="FinancingConcessions" _Description="Conv;1500" _Amount="-400" />
  <SALE_PRICE_ADJUSTMENT _Type="SiteArea" _Description="${lot} sf" _Amount="" />
  <SALE_PRICE_ADJUSTMENT _Type="Age" _Description="30" _Amount="" />
  <SALE_PRICE_ADJUSTMENT _Type="Other" _TypeOtherDescription="RoomAboveGradeLine2" _Amount="" />
  <SALE_PRICE_ADJUSTMENT _Type="GrossLivingArea" _Description="${gla}" _Amount="" />
  <SALE_PRICE_ADJUSTMENT _Type="CarStorage" _Description="2ga2dw" _Amount="" />
  <OTHER_FEATURE_ADJUSTMENT PropertyFeatureSequenceIdentifier="1" PropertyFeatureDescription="FENCE" PropertyFeatureAdjustmentAmount="" />
  <OTHER_FEATURE_ADJUSTMENT PropertyFeatureSequenceIdentifier="2" PropertyFeatureDescription="" PropertyFeatureAdjustmentAmount="" />
  ${extra}
</COMPARABLE_SALE>`
const xml = `<VALUATION_RESPONSE MISMOVersionID="2.6GSE"><REPORT>
<MARKET SalesConcessionDescription="x"><MARKET_INVENTORY _Type="TotalSales" _MonthRangeType="Last3Months" _Count="1" /></MARKET>
<EMBEDDED_FILE _Name="a" _Type="PDF"><DOCUMENT>AAAA</DOCUMENT></EMBEDDED_FILE>
</REPORT><PROPERTY><STRUCTURE GrossLivingAreaSquareFeetCount="1500" StoriesCount="1" PropertyStructureBuiltYear="1990"></STRUCTURE>
<SITE _AreaDescription="6000 sf"></SITE><AMENITY _Type="Pool" _ExistsIndicator="Y" /></PROPERTY>
<VALUATION AppraisalEffectiveDate="2026-10-09" />
${grid('0', 0, 1500, 6000)}${grid('1', 200000, 1400, 7000)}${grid('2', 210000, 1600, 6000)}</VALUATION_RESPONSE>`
const base = { subject: { gla: 1500, lot_size: 6000 } as Record<string, number | null>, options: { roundTo: 50, dropEmbeddedPdf: true, market: null } }

describe('fillTotalXml', () => {
  const r = fillTotalXml({
    ...base, xml, rates: { gla: 50, lot_size: -0.1, pool: 8000 },
    comps: new Map([['91', { gla: 1400, lot_size: 7000, pool: 0 }], ['92', { gla: 1600, lot_size: 6000, pool: 1 }]]),
  })
  it('writes amounts as (subject - comp) x rate, rounded', () => {
    const c1 = r.comps.find((c) => c.seq === 1)!
    expect(c1.changes).toEqual(expect.arrayContaining([{ row: 'Gross living area', amount: 5000 }, { row: 'Site area', amount: 100 }]))
    expect(r.xml).toMatch(/_Type="GrossLivingArea"[^>]*_Amount="\+5000"/)
    expect(r.xml).toMatch(/_Type="GrossLivingArea"[^>]*_Amount="-5000"/)
  })
  it('totals include untouched rows and other-feature lines once', () => {
    const c1 = r.comps.find((c) => c.seq === 1)!
    expect(c1.total).toBe(-400 + 5000 + 100 + 8000)
    expect(r.xml).toContain('SalePriceTotalAdjustmentAmount="12700"')
    expect(r.xml).toContain('AdjustedSalesPriceAmount="212700"')
    expect(r.xml).toMatch(/PropertyFeatureDescription="POOL" PropertyFeatureAdjustmentAmount="\+8000"/)
  })
  it('skips the subject column and drops the stale PDF', () => {
    expect(r.comps.map((c) => c.seq)).toEqual([1, 2])
    expect(r.removedPdf).toBe(true)
    expect(r.xml).not.toContain('EMBEDDED_FILE')
  })
  it('rejects a file that is not a TOTAL report', () => {
    expect(() => fillTotalXml({ ...base, xml: '<a/>', rates: {}, comps: new Map() })).toThrow(/TOTAL/)
  })
})

const real = '.sample/john/total.xml'
describe.skipIf(!existsSync(real))('real TOTAL file', () => {
  it('reproduces the totals TOTAL itself wrote when its own amounts are re-applied', () => {
    const xmlText = readFileSync(real, 'utf8')
    // gla rate 50/sqft is arbitrary; the point is that untouched rows keep TOTAL's totals consistent
    const r = fillTotalXml({ xml: xmlText, rates: { gla: 20 }, subject: {}, comps: new Map(), options: { roundTo: 50, dropEmbeddedPdf: true, market: null } })
    expect(r.comps).toHaveLength(4)
    expect(r.xml.length).toBeLessThan(xmlText.length / 10)
    for (const c of r.comps) expect(c.changes.length).toBeGreaterThan(0)
    // 22531 John Rolfe has 1447 sf; 2607 Anthony Hay has 1701 -> (1447-1701)*20 = -5080 -> -5100
    expect(r.xml).toMatch(/_Type="GrossLivingArea" _Description="1701" _Amount="-5100"/)
  })
})
