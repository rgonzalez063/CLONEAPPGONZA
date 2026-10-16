// What a document scan returns, and how it becomes the app's own data. Shared by the server (which asks the model)
// and the browser (which shows the result for review). Nothing here talks to the network.
import type { Listing } from '@/engines'
import type { StoredProperty } from './importer'
import type { Subject } from './types'

export type ExtractTarget = 'subject' | 'sales' | 'market'
export type Confidence = 'high' | 'medium' | 'low'

/** One value the model read from the document, with the words it read it from. */
export interface Field<T> { value: T | null; evidence: string }

export interface SubjectScan {
  documentType: string
  notes: string
  fields: {
    address: Field<string>; city: Field<string>; state: Field<string>; zip: Field<string>
    gla: Field<number>; lotSize: Field<number>; bedrooms: Field<number>; bathsFull: Field<number>; bathsHalf: Field<number>
    stories: Field<number>; garage: Field<number>; yearBuilt: Field<number>
    quality: Field<string>; condition: Field<string>; effectiveDate: Field<string>
  }
}

export interface SaleRow {
  mlsNumber: string | null; address: string | null; status: string | null
  salePrice: number | null; saleDate: string | null; contractDate: string | null; listPrice: number | null
  gla: number | null; lotSize: number | null; bedrooms: number | null; bathsFull: number | null; bathsHalf: number | null
  garage: number | null; stories: number | null; yearBuilt: number | null; pool: boolean | null
  concessions: number | null; financing: string | null; confidence: Confidence; note: string
}
export interface SalesScan { documentType: string; notes: string; sales: SaleRow[] }

export interface MarketRow {
  mlsNumber: string | null; address: string | null; status: string | null
  listDate: string | null; origListPrice: number | null; listPrice: number | null; soldPrice: number | null
  closeDate: string | null; contractDate: string | null; offMarketDate: string | null; withdrawnDate: string | null
  expirationDate: string | null; terminationDate: string | null
  gla: number | null; lotSize: number | null; yearBuilt: number | null; dom: number | null; concessions: number | null
  specialConditions: string | null; confidence: Confidence; note: string
}
export interface MarketScan { documentType: string; notes: string; listings: MarketRow[] }

export type Scan = SubjectScan | SalesScan | MarketScan

// ------------------------------------------------------------------ checks and conversion
const isoDate = (s: string | null | undefined) => {
  const t = (s ?? '').trim()
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  const d = us ? `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}` : /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
  return d && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) ? d : null
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const text = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '')
const inRange = (v: number | null, lo: number, hi: number) => (v !== null && v >= lo && v <= hi ? v : null)

export interface Problem { index: number; reason: string }

/** Subject form values from a scan. Out-of-range numbers are dropped, not guessed at. */
export function toSubject(scan: SubjectScan): { subject: Partial<Subject>; filled: string[]; effectiveDate: string | null } {
  const f = scan.fields
  const out: Partial<Subject> = {}
  const set = <K extends keyof Subject>(k: K, v: Subject[K] | null) => { if (v !== null && v !== '') out[k] = v as Subject[K] }
  const street = text(f.address.value, 300)
  const locality = [text(f.city.value, 60), text(f.state.value, 10), text(f.zip.value, 10)].filter(Boolean).join(' ')
  set('address', [street, locality].filter(Boolean).join(', ') || null)
  set('zip', /^\d{5}/.test(text(f.zip.value, 10)) ? text(f.zip.value, 10).slice(0, 5) : null)
  set('gla', inRange(num(f.gla.value), 200, 50000))
  set('lot_size', inRange(num(f.lotSize.value), 100, 1e8))
  set('baths_full', inRange(num(f.bathsFull.value), 0, 20))
  set('baths_half', inRange(num(f.bathsHalf.value), 0, 20))
  set('stories', inRange(num(f.stories.value), 1, 10))
  set('garage', inRange(num(f.garage.value), 0, 20))
  const q = /^Q[1-6]\+?$/i.exec(text(f.quality.value, 4)); if (q) out.quality = q[0].toUpperCase()
  const c = /^C[1-6]\+?$/i.exec(text(f.condition.value, 4)); if (c) out.condition = c[0].toUpperCase()
  return { subject: out, filled: Object.keys(out), effectiveDate: isoDate(f.effectiveDate.value) }
}

export interface ConvertedSales { properties: StoredProperty[]; problems: Problem[] }
/** Sales rows as stored properties. A row needs a price and a date; anything else missing is left unknown. */
export function toProperties(rows: SaleRow[], effectiveDate: string): ConvertedSales {
  const properties: StoredProperty[] = []
  const problems: Problem[] = []
  const seen = new Set<string>()
  const year = Number(effectiveDate.slice(0, 4))
  rows.forEach((r, index) => {
    const price = num(r.salePrice)
    const date = isoDate(r.saleDate)
    if (price === null || price < 1000 || price > 1e9) { problems.push({ index, reason: 'No usable sale price.' }); return }
    if (!date) { problems.push({ index, reason: 'No usable sale date.' }); return }
    const id = text(r.mlsNumber, 64) || text(r.address, 64)
    if (!id) { problems.push({ index, reason: 'No MLS number or address to identify it.' }); return }
    if (seen.has(id)) { problems.push({ index, reason: 'Repeats an earlier row.' }); return }
    if (date > effectiveDate) { problems.push({ index, reason: 'Closed after the effective date.' }); return }
    seen.add(id)
    const yb = inRange(num(r.yearBuilt), 1800, 2100)
    const values: Record<string, number | null> = {
      gla: inRange(num(r.gla), 200, 50000), lot_size: inRange(num(r.lotSize), 100, 1e8), baths_full: inRange(num(r.bathsFull), 0, 20), baths_half: inRange(num(r.bathsHalf), 0, 20),
      garage: inRange(num(r.garage), 0, 20), carport: null, stories: inRange(num(r.stories), 1, 10), beds: inRange(num(r.bedrooms), 0, 30),
      pool: r.pool === null ? null : r.pool ? 1 : 0, age: yb ? year - yb : null, year_built: yb,
    }
    properties.push({
      id, salePrice: Math.round(price), saleDate: date, contractDate: isoDate(r.contractDate), status: /closed|sold/i.test(r.status ?? '') || !r.status ? 'closed' : text(r.status, 30), values,
      meta: { concessions: inRange(num(r.concessions), 0, 1e7) ?? 0, financing: text(r.financing), special: '', ownership: '' },
    })
  })
  return { properties, problems }
}

export interface ConvertedMarket { listings: Listing[]; problems: Problem[] }
export function toListings(rows: MarketRow[]): ConvertedMarket {
  const listings: Listing[] = []
  const problems: Problem[] = []
  const seen = new Set<string>()
  rows.forEach((r, index) => {
    const id = text(r.mlsNumber, 64) || text(r.address, 64)
    if (!id) { problems.push({ index, reason: 'No MLS number or address to identify it.' }); return }
    if (seen.has(id)) { problems.push({ index, reason: 'Repeats an earlier row.' }); return }
    const status = text(r.status, 60)
    if (!status) { problems.push({ index, reason: 'No status.' }); return }
    const listDate = isoDate(r.listDate)
    if (!listDate) { problems.push({ index, reason: 'No usable list date.' }); return }
    seen.add(id)
    listings.push({
      id, status, listDate, origListPrice: inRange(num(r.origListPrice), 1000, 1e9), listPrice: inRange(num(r.listPrice), 1000, 1e9), soldPrice: inRange(num(r.soldPrice), 1000, 1e9),
      closeDate: isoDate(r.closeDate), contractDate: isoDate(r.contractDate), offMarketDate: isoDate(r.offMarketDate), withdrawnDate: isoDate(r.withdrawnDate),
      expirationDate: isoDate(r.expirationDate), terminationDate: isoDate(r.terminationDate),
      gla: inRange(num(r.gla), 200, 50000), lotSize: inRange(num(r.lotSize), 100, 1e8), yearBuilt: inRange(num(r.yearBuilt), 1800, 2100), dom: inRange(num(r.dom), 0, 5000),
      concessions: inRange(num(r.concessions), 0, 1e7), special: text(r.specialConditions, 400),
    })
  })
  return { listings, problems }
}

export const TARGET_LABELS: Record<ExtractTarget, string> = {
  subject: 'Subject property details', sales: 'Sales (comparable and neighborhood)', market: 'Market listings (every status)',
}
export const ACCEPTED = 'PDF, photos and screenshots (PNG, JPG, WebP, GIF), Word (.docx), Excel (.xlsx), CSV, text, RTF and HTML'
