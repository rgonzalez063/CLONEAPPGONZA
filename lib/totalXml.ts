// Fills a TOTAL report that was saved as XML (MISMO 2.6GSE, the format "Open UAD XML" reads) with this app's results.
// The appraiser enters the comps in TOTAL as usual and saves the report as XML; this copies the chosen adjustments
// into the grid, redoes the totals, and (optionally) the 1004MC figures. Everything else in the file is left as it was.
// Edits are made on the text of the file, never by re-writing it, so TOTAL sees exactly what it wrote except for the changed values.
import { concessionNarrative, marketNarrative, mc1004, reoNarrative, suggestAssistancePrevalent, concessionStats, reoStats, trendSummary, type Listing } from '@/engines'
import { resolveFeature } from './features'

export interface FillOptions {
  roundTo: number // adjustments are rounded to this many dollars (1 = none)
  dropEmbeddedPdf: boolean // the PDF stored inside the file shows the old numbers
  market: null | { listings: Listing[]; effective: string; source: string; notes: Record<string, string | boolean | null> }
}
export interface FillInput {
  xml: string
  rates: Record<string, number> // feature key -> chosen adjustment per unit
  subject: Record<string, number | null> // the subject's value for each feature, where the app knows it
  comps: Map<string, Record<string, number | null>> // MLS number -> feature values of that sale
  options: FillOptions
}
export interface CompReport { seq: number; address: string; mls: string; matched: boolean; changes: { row: string; amount: number }[]; total: number | null; adjusted: number | null }
export interface FillReport { xml: string; comps: CompReport[]; warnings: string[]; marketUpdated: boolean; removedPdf: boolean }

// ------------------------------------------------------------------ text editing helpers
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
function getAttr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)
  return m ? unesc(m[1]) : null
}
function setAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`((?:^|\\s)${name}=")[^"]*(")`)
  if (re.test(tag)) return tag.replace(re, (_, a: string, b: string) => `${a}${esc(value)}${b}`)
  return tag.replace(/(\s*\/?>)$/, ` ${name}="${esc(value)}"$1`)
}
const signed = (n: number) => (n === 0 ? '0' : n > 0 ? `+${n}` : String(n))
const toNum = (s: string | null) => { const t = (s ?? '').replace(/[,$\s]/g, ''); return t !== '' && Number.isFinite(Number(t)) ? Number(t) : null }

// ------------------------------------------------------------------ which grid row a feature belongs to
type Row = 'GrossLivingArea' | 'SiteArea' | 'Age' | 'CarStorage' | 'Room1' | 'Room2' | 'Other'
export function rowFor(key: string): Row {
  if (key === 'gla') return 'GrossLivingArea'
  if (key === 'lot_size') return 'SiteArea'
  if (key === 'age' || key === 'year_built') return 'Age'
  if (key === 'garage' || key === 'carport' || key.startsWith('garage_')) return 'CarStorage'
  if (key === 'rooms') return 'Room1'
  if (key === 'baths_full' || key === 'baths_half' || key === 'beds') return 'Room2'
  return 'Other'
}

// ------------------------------------------------------------------ what the file itself says (fallback values)
function subjectFromXml(xml: string, effectiveYear: number | null): Record<string, number | null> {
  const first = (re: RegExp) => { const m = re.exec(xml); return m ? toNum(m[1]) : null }
  const built = first(/PropertyStructureBuiltYear="(\d+)"/)
  const site = /<SITE [^>]*_AreaDescription="([^"]*)"/.exec(xml)
  const pool = /<AMENITY _Type="Pool"[^>]*_ExistsIndicator="([YN])"/.exec(xml)
  const fire = /<AMENITY _Type="Fireplace"[^>]*_Count="(\d+)"/.exec(xml)
  const garage = /<CAR_STORAGE_LOCATION _Type="Garage"[^>]*ParkingSpacesCount="(\d+)"/.exec(xml)
  const carport = /<CAR_STORAGE_LOCATION _Type="Carport"[^>]*ParkingSpacesCount="(\d+)"/.exec(xml)
  return {
    gla: first(/GrossLivingAreaSquareFeetCount="(\d+)"/), lot_size: site ? toNum(/[\d,.]+/.exec(site[1])?.[0] ?? null) : null,
    age: built && effectiveYear ? effectiveYear - built : null, year_built: built,
    pool: pool ? (pool[1] === 'Y' ? 1 : 0) : null, fireplaces: fire ? Number(fire[1]) : null,
    garage: garage ? Number(garage[1]) : null, carport: carport ? Number(carport[1]) : null,
    stories: first(/<STRUCTURE [^>]*StoriesCount="(\d+)"/),
  }
}
function compFromXml(block: string): Record<string, number | null> {
  const desc = (t: string) => { const m = new RegExp(`<SALE_PRICE_ADJUSTMENT _Type="${t}"[^>]*_Description="([^"]*)"`).exec(block); return m ? unesc(m[1]) : '' }
  const car = /(\d+)\s*ga/i.exec(desc('CarStorage'))
  return { gla: toNum(desc('GrossLivingArea')), lot_size: toNum(/[\d,.]+/.exec(desc('SiteArea'))?.[0] ?? null), age: toNum(desc('Age')), garage: car ? Number(car[1]) : null }
}

// ------------------------------------------------------------------ the fill
export function fillTotalXml(input: FillInput): FillReport {
  const { options } = input
  const warnings: string[] = []
  let xml = input.xml
  if (!/<VALUATION_RESPONSE[\s>]/.test(xml) || !/<COMPARABLE_SALE[\s>]/.test(xml)) throw new Error('This does not look like a TOTAL report saved as XML. In TOTAL, save or export the report as XML (UAD) and choose that file.')

  const effective = /AppraisalEffectiveDate="(\d{4})-/.exec(xml)
  const xmlSubject = subjectFromXml(xml, effective ? Number(effective[1]) : null)
  const subject = (k: string) => input.subject[k] ?? xmlSubject[k] ?? null
  const keys = Object.keys(input.rates).filter((k) => Number.isFinite(input.rates[k]))
  const round = (v: number) => (options.roundTo > 1 ? Math.round(v / options.roundTo) * options.roundTo : Math.round(v))
  const comps: CompReport[] = []
  const unmapped = new Set<string>()

  xml = xml.replace(/<COMPARABLE_SALE\b[\s\S]*?<\/COMPARABLE_SALE>/g, (block) => {
    const open = /^<COMPARABLE_SALE\b[^>]*>/.exec(block)![0]
    const seq = Number(getAttr(open, 'PropertySequenceIdentifier') ?? -1)
    const address = getAttr(/<LOCATION\b[^>]*>/.exec(block)?.[0] ?? '', 'PropertyStreetAddress') ?? ''
    if (seq <= 0) return block // column 0 is the subject
    const mls = /#\s*([A-Za-z0-9-]+)/.exec(getAttr(open, 'DataSourceDescription') ?? '')?.[1] ?? /#\s*([A-Za-z0-9-]+)/.exec(/GSEDataSourceDescription="([^"]*)"/.exec(block)?.[1] ?? '')?.[1] ?? ''
    const fromApp = input.comps.get(mls)
    const report: CompReport = { seq, address, mls, matched: !!fromApp, changes: [], total: null, adjusted: null }
    const fallback = compFromXml(block)
    const value = (k: string) => fromApp?.[k] ?? fallback[k] ?? null

    // the dollars each grid row receives
    const rows: Partial<Record<Row, number>> = {}
    const others: { label: string; amount: number }[] = []
    for (const k of keys) {
      const f = resolveFeature(k)
      const s = subject(k) ?? (f?.unit === 'yes/no' ? 1 : null)
      const c = value(k)
      if (s === null || c === null || !f) { if (f) unmapped.add(f.label); continue }
      const amount = round((s - c) * input.rates[k])
      const row = rowFor(k)
      if (row === 'Other') others.push({ label: f.label.toUpperCase(), amount })
      else rows[row] = (rows[row] ?? 0) + amount
    }

    let out = block
    const setRow = (type: string, other: string | null, amount: number, label: string) => {
      const re = other
        ? new RegExp(`<SALE_PRICE_ADJUSTMENT _Type="Other"[^>]*_TypeOtherDescription="${other}"[^>]*/>`)
        : new RegExp(`<SALE_PRICE_ADJUSTMENT _Type="${type}"[^>]*/>`)
      if (!re.test(out)) { warnings.push(`Comparable ${seq} (${address}) has no ${label} row in the file; ${label} adjustment skipped.`); return }
      out = out.replace(re, (tag) => setAttr(tag, '_Amount', signed(amount)))
      report.changes.push({ row: label, amount })
    }
    if (rows.GrossLivingArea !== undefined) setRow('GrossLivingArea', null, rows.GrossLivingArea, 'Gross living area')
    if (rows.SiteArea !== undefined) setRow('SiteArea', null, rows.SiteArea, 'Site area')
    if (rows.Age !== undefined) setRow('Age', null, rows.Age, 'Age')
    if (rows.CarStorage !== undefined) setRow('CarStorage', null, rows.CarStorage, 'Car storage')
    if (rows.Room1 !== undefined) setRow('Other', 'RoomAboveGradeLine1', rows.Room1, 'Room count (total)')
    if (rows.Room2 !== undefined) setRow('Other', 'RoomAboveGradeLine2', rows.Room2, 'Room count (bedrooms and baths)')
    if (rows.Room1 !== undefined || rows.Room2 !== undefined) {
      out = out.replace(/<ROOM_ADJUSTMENT\b[^>]*\/>/, (tag) => setAttr(tag, 'RoomAdjustmentAmount', signed((rows.Room1 ?? 0) + (rows.Room2 ?? 0))))
    }
    // features with no row of their own go in the "other" lines under the grid
    const slots = [...out.matchAll(/<OTHER_FEATURE_ADJUSTMENT\b[^>]*\/>/g)].map((m) => m[0])
    for (const o of others) {
      const slot = slots.find((t) => getAttr(t, 'PropertyFeatureDescription')?.toUpperCase() === o.label) ?? slots.find((t) => !getAttr(t, 'PropertyFeatureDescription') && !getAttr(t, 'PropertyFeatureAdjustmentAmount'))
      if (!slot) { warnings.push(`Comparable ${seq} (${address}): no free "other" line for ${o.label}. Enter it in TOTAL by hand (${signed(o.amount)}).`); continue }
      let next = setAttr(slot, 'PropertyFeatureDescription', o.label)
      next = setAttr(next, 'PropertyFeatureAdjustmentAmount', signed(o.amount))
      out = out.replace(slot, next)
      slots[slots.indexOf(slot)] = next
      report.changes.push({ row: o.label, amount: o.amount })
    }

    // totals: every dollar in the grid, the room lines counted once
    const price = toNum(getAttr(open, 'PropertySalesAmount'))
    const amounts: number[] = []
    for (const t of out.match(/<SALE_PRICE_ADJUSTMENT\b[^>]*\/>/g) ?? []) { const n = toNum(getAttr(t, '_Amount')); if (n !== null) amounts.push(n) }
    for (const t of out.match(/<OTHER_FEATURE_ADJUSTMENT\b[^>]*\/>/g) ?? []) { const n = toNum(getAttr(t, 'PropertyFeatureAdjustmentAmount')); if (n !== null) amounts.push(n) }
    if (price && report.changes.length) {
      const net = amounts.reduce((a, b) => a + b, 0)
      const gross = amounts.reduce((a, b) => a + Math.abs(b), 0)
      let tag = open
      tag = setAttr(tag, 'SalesPriceTotalAdjustmentPositiveIndicator', net > 0 ? 'Y' : 'N')
      tag = setAttr(tag, 'SalePriceTotalAdjustmentAmount', String(net))
      tag = setAttr(tag, 'AdjustedSalesPriceAmount', String(price + net))
      tag = setAttr(tag, 'SalesPriceTotalAdjustmentGrossPercent', ((gross / price) * 100).toFixed(1))
      tag = setAttr(tag, 'SalePriceTotalAdjustmentNetPercent', ((Math.abs(net) / price) * 100).toFixed(1))
      out = tag + out.slice(open.length)
      report.total = net
      report.adjusted = price + net
    }
    if (!fromApp) warnings.push(`Comparable ${seq} (${address || 'no address'}, MLS ${mls || 'unknown'}) is not in this session's sales. Its own values from the file were used for GLA, lot, age and garage; other features were skipped.`)
    comps.push(report)
    return out
  })
  if (unmapped.size) warnings.push(`No value for the subject or a comparable, so skipped: ${[...unmapped].join(', ')}.`)

  const marketUpdated = options.market ? applyMarket(options.market) : false
  function applyMarket(m: NonNullable<FillOptions['market']>): boolean {
    const cols = mc1004(m.listings, m.effective)
    if (!cols.length) return false
    const col = (range: string) => cols[range === 'Prior7To12Months' ? 0 : range === 'Prior4To6Months' ? 1 : 2]
    const usd = (v: number | null) => (v === null ? '' : `$${Math.round(v).toLocaleString('en-US')}`)
    const num = (v: number | null, d = 0) => (v === null ? '' : v.toFixed(d))
    let touched = false
    xml = xml.replace(/<MARKET_INVENTORY\b[^>]*_MonthRangeType="[^"]+"[^>]*\/>/g, (tag, offset: number) => {
      // the (empty) project block inside <SUBJECT_PROJECT> belongs to condominiums; leave it alone
      const before = xml.lastIndexOf('<SUBJECT_PROJECT', offset)
      if (before !== -1 && xml.indexOf('</SUBJECT_PROJECT>', before) > offset) return tag
      const type = getAttr(tag, '_Type')
      const c = col(getAttr(tag, '_MonthRangeType') ?? '')
      const set = (attr: string, v: string) => { touched = true; return setAttr(tag, attr, v) }
      switch (type) {
        case 'TotalSales': return set('_Count', String(c.sales))
        case 'AbsorptionRate': return set('_Rate', num(c.absorption, 2))
        case 'TotalListings': return set('_Count', String(c.actives))
        case 'Supply': return set('_Count', num(c.monthsSupply, 1))
        case 'MedianSalesPrice': return set('_Amount', usd(c.medSalePrice))
        case 'MedianSalesDOM': return set('_Count', num(c.medDom))
        case 'MedianListPrice': return set('_Amount', usd(c.medListPrice))
        case 'MedianSalesToListRatio': return set('_Rate', c.medSaleToList === null ? '' : `${Math.round(c.medSaleToList)}%`)
        default: return tag
      }
    })
    const conc = concessionStats(m.listings, m.effective)
    const reo = reoStats(m.listings, m.effective)
    const trend = trendSummary(m.listings, m.effective)
    const assist = typeof m.notes.assist === 'boolean' ? m.notes.assist : suggestAssistancePrevalent(conc)
    xml = xml.replace(/<MARKET\b[^>]*>/, (tag) => {
      let t = setAttr(tag, 'SalesConcessionDescription', concessionNarrative(conc, m.source))
      t = setAttr(t, 'NeighborhoodMarketabilityFactorsDescription', reoNarrative(reo, m.source))
      t = setAttr(t, 'MarketTrendsReconciliationComment', [trend ? marketNarrative(trend) : '', String(m.notes.extra ?? '')].filter(Boolean).join(' '))
      return setAttr(t, 'MarketTrendsAdverseFinancingIndicator', assist ? 'Y' : 'N')
    })
    warnings.push('The 1004MC figures were replaced. The trend boxes (Increasing, Stable, Declining) were left as you set them in TOTAL; check that they still agree with the new numbers.')
    return touched
  }

  let removedPdf = false
  if (options.dropEmbeddedPdf && /<EMBEDDED_FILE\b/.test(xml)) {
    xml = xml.replace(/[ \t]*<EMBEDDED_FILE\b[\s\S]*?<\/EMBEDDED_FILE>\r?\n?/, '')
    removedPdf = true
  }
  if (!comps.some((c) => c.changes.length)) warnings.push('No adjustment was written. Check that features are marked Done with a chosen adjustment and that the comps in the file match MLS numbers in this session.')
  return { xml, comps, warnings, marketUpdated, removedPdf }
}
