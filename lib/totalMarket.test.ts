import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Listing } from '@/engines'
import { importMarketCsv } from './marketImport'
import { fillTotalXml } from './totalXml'

const L = (id: string, close: string, price: number, list: number, dom: number): Listing => ({
  id, status: 'Closed', listDate: '2026-01-01', origListPrice: list, listPrice: list, soldPrice: price, closeDate: close, contractDate: null, offMarketDate: null,
  withdrawnDate: null, expirationDate: null, terminationDate: null, gla: 1500, lotSize: 6000, yearBuilt: 1990, dom, concessions: 0, special: '',
})
const listings = [L('1', '2025-12-20', 200000, 205000, 20), L('2', '2026-03-10', 210000, 210000, 30), L('3', '2026-05-15', 215000, 220000, 40), L('4', '2026-09-01', 230000, 232000, 10), L('5', '2026-09-20', 240000, 240000, 12)]
const market = { listings, effective: '2026-10-09', source: 'HARMLS', notes: {} }
const bare = `<VALUATION_RESPONSE><REPORT><FORM AppraisalReportContentSequenceIdentifier="1" AppraisalReportContentType="AppraisalForm" AppraisalReportContentName="URAR [UAD Version]" AppraisalReportContentIdentifier="UAD Version 9/2011" AppraisalReportContentIsPrimaryFormIndicator="Y" /><EMBEDDED_FILE><DOCUMENT>AA</DOCUMENT></EMBEDDED_FILE></REPORT><SALES_COMPARISON><COMPARABLE_SALE PropertySequenceIdentifier="1" PropertySalesAmount="1"></COMPARABLE_SALE></SALES_COMPARISON></VALUATION_RESPONSE>`
const opts = { roundTo: 1, dropEmbeddedPdf: false, market }

describe('1004MC in the TOTAL file', () => {
  it('adds the form when the file has none', () => {
    const r = fillTotalXml({ xml: bare, rates: {}, subject: {}, comps: new Map(), options: opts })
    expect(r.marketUpdated).toBe(true)
    expect(r.xml).toContain('AppraisalReportContentIdentifier="1004MC"')
    expect(r.xml).toContain('AppraisalReportContentSequenceIdentifier="2"')
    expect(r.xml).toContain('<MARKET_INVENTORY _Type="TotalSales" _MonthRangeType="Last3Months" _Count="2" />')
    expect(r.xml).toMatch(/_Type="MedianSalesPrice" _MonthRangeType="Last3Months" _Amount="\$235,000"/)
    expect(r.xml).toMatch(/_Type="TotalSales" _TrendType="(Increasing|Stable|Declining)"/)
    expect(r.xml.indexOf('1004MC')).toBeGreaterThan(r.xml.indexOf('URAR [UAD Version]'))
    expect(r.warnings.join(' ')).toMatch(/no 1004MC form/)
  })
  it('is well formed XML', () => {
    const r = fillTotalXml({ xml: bare, rates: {}, subject: {}, comps: new Map(), options: opts })
    const depth = (r.xml.match(/<MARKET\b/g) ?? []).length - (r.xml.match(/<\/MARKET>/g) ?? []).length
    expect(depth).toBe(0)
    expect((r.xml.match(/<FORM\b[^>]*[^/]>/g) ?? []).length).toBe((r.xml.match(/<\/FORM>/g) ?? []).length)
  })
  it('keeps the trend boxes of an existing form unless asked', () => {
    const withForm = fillTotalXml({ xml: bare, rates: {}, subject: {}, comps: new Map(), options: opts }).xml.replace(/_TrendType="[A-Za-z]+"/g, '_TrendType="Stable"')
    const kept = fillTotalXml({ xml: withForm, rates: {}, subject: {}, comps: new Map(), options: opts }).xml
    expect(kept).not.toMatch(/_TrendType="(Increasing|Declining)"/)
    const reset = fillTotalXml({ xml: withForm, rates: {}, subject: {}, comps: new Map(), options: { ...opts, setTrends: true } }).xml
    expect(reset).toMatch(/_TrendType="(Increasing|Declining)"/)
  })
})

const have = existsSync('.sample/john/total.xml') && existsSync('.sample/john/mc.csv')
describe.skipIf(!have)("the app's 1004MC against what TOTAL wrote for John Rolfe Ln", () => {
  it('gives the same figures as TOTAL for every line it fills', () => {
    const xml = readFileSync('.sample/john/total.xml', 'utf8')
    const mc = importMarketCsv(readFileSync('.sample/john/mc.csv', 'utf8'))
    const o = { ...opts, market: { listings: mc.listings, effective: '2026-10-09', source: 'HARMLS', notes: {} } }
    const mine = fillTotalXml({ xml, rates: {}, subject: {}, comps: new Map(), options: o }).xml
    const lines = (x: string) => (x.match(/<MARKET_INVENTORY _Type="[A-Za-z]+" _MonthRangeType="[^"]+" [^>]*\/>/g) ?? []).filter((t) => !/_Count=""|_Rate=""/.test(t))
    const theirs = lines(xml)
    const ours = new Set(lines(mine))
    const missing = theirs.filter((t) => !ours.has(t))
    console.log('differences from TOTAL:', missing.length, 'of', theirs.length, missing.slice(0, 6))
    expect(theirs.length).toBeGreaterThan(20)
    expect(missing.length).toBeLessThanOrEqual(3)
  })
})
