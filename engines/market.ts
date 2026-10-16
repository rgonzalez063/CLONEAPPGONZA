// Market conditions: the 1004MC inventory table, seller concession and REO factors, monthly trends and the
// neighborhood and market characteristics summaries. Pure functions over a list of listings of every status.
import { mean, median } from './stats'

export interface Listing {
  id: string
  status: string
  listDate: string | null // yyyy-mm-dd
  origListPrice: number | null
  listPrice: number | null // the last list price
  soldPrice: number | null
  closeDate: string | null
  contractDate: string | null // the pending date
  offMarketDate: string | null
  withdrawnDate: string | null
  expirationDate: string | null
  terminationDate: string | null
  gla: number | null
  lotSize: number | null
  yearBuilt: number | null
  dom: number | null
  concessions: number | null
  special: string // special conditions and disclosures, as text
}

// ------------------------------------------------------------------ dates
const DAY = 86400000
const t = (iso: string | null): number | null => (iso ? Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) : null)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The date n calendar months before another, clamped to the end of a short month. */
export function monthsBefore(isoDate: string, n: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(d.getUTCMonth() - n)
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, last))
  return iso(d.getTime())
}

// ------------------------------------------------------------------ status
export const isSold = (l: Listing) => /sold|closed/i.test(l.status) && !!l.closeDate && (l.soldPrice ?? 0) > 0
const OFF = /expired|withdrawn|terminated|cancel/i
const PENDING = /pending|contingent|option|under contract/i
export type Bucket = 'sold' | 'active' | 'pending' | 'offmarket'
export function bucketOf(l: Listing): Bucket {
  if (/sold|closed/i.test(l.status)) return 'sold'
  if (OFF.test(l.status)) return 'offmarket'
  if (PENDING.test(l.status)) return 'pending'
  return 'active'
}
export const isREO = (l: Listing) => /\bREO\b|real\s+estate\s+owned|bank[\s-]?owned|foreclos/i.test(l.special)
export const isShortSale = (l: Listing) => /short\s*sale/i.test(l.special)

/** Was the listing on the market, not yet under contract, closed or ended, on a given day? */
export function activeAt(l: Listing, day: string): boolean {
  const start = t(l.listDate)
  const at = t(day)!
  if (start === null || start > at) return false
  const ends = [l.closeDate, l.offMarketDate, l.withdrawnDate, l.expirationDate, l.terminationDate, l.contractDate]
    .map(t).filter((x): x is number => x !== null && x >= start)
  if (ends.some((x) => x <= at)) return false
  return !(ends.length === 0 && /sold|closed/i.test(l.status)) // a sold row with no dates at all is not an open listing
}

// ------------------------------------------------------------------ 1004MC
export interface Period { label: string; start: string; end: string; months: number }
/** The three periods of the 1004MC, counted back from the effective date: current 3 months, prior 4 to 6, prior 7 to 12. */
export function periods(effective: string): Period[] {
  const m = (n: number) => monthsBefore(effective, n)
  return [
    { label: 'Prior 7-12 months', start: m(12), end: m(6), months: 6 },
    { label: 'Prior 4-6 months', start: m(6), end: m(3), months: 3 },
    { label: 'Current 3 months', start: m(3), end: effective, months: 3 },
  ]
}
const soldIn = (ls: Listing[], p: { start: string; end: string }) => ls.filter((l) => isSold(l) && l.closeDate! > p.start && l.closeDate! <= p.end)
const med = (xs: (number | null | undefined)[]) => { const v = xs.filter((x): x is number => x !== null && x !== undefined && Number.isFinite(x)); return v.length ? median(v) : null }

export interface McColumn {
  label: string; start: string; end: string
  sales: number; absorption: number; actives: number; monthsSupply: number | null
  medSalePrice: number | null; medDom: number | null; medListPrice: number | null; medSaleToList: number | null; concessionPct: number | null
}
export function mc1004(ls: Listing[], effective: string): McColumn[] {
  return periods(effective).map((p) => {
    const solds = soldIn(ls, p)
    const actives = ls.filter((l) => activeAt(l, p.end))
    const absorption = solds.length / p.months
    return {
      label: p.label, start: p.start, end: p.end, sales: solds.length, absorption, actives: actives.length,
      monthsSupply: absorption > 0 ? actives.length / absorption : null,
      medSalePrice: med(solds.map((l) => l.soldPrice)),
      medDom: med(solds.map((l) => l.dom)),
      medListPrice: med(actives.map((l) => l.listPrice)),
      medSaleToList: med(solds.filter((l) => (l.listPrice ?? 0) > 0).map((l) => (l.soldPrice! / l.listPrice!) * 100)),
      concessionPct: solds.length ? (100 * solds.filter((l) => (l.concessions ?? 0) > 0).length) / solds.length : null,
    }
  })
}

// ------------------------------------------------------------------ seller concessions and REO
export interface ConcessionStats {
  start: string; end: string; sales: number; withConcessions: number; pct: number | null
  amounts: { min: number; max: number; median: number } | null
  periods: { label: string; sales: number; withConcessions: number; pct: number | null }[]
}
export function concessionStats(ls: Listing[], effective: string): ConcessionStats {
  const year = { start: monthsBefore(effective, 12), end: effective }
  const s12 = soldIn(ls, year)
  const withC = (a: Listing[]) => a.filter((l) => (l.concessions ?? 0) > 0)
  const amts = withC(s12).map((l) => l.concessions!)
  return {
    ...year, sales: s12.length, withConcessions: withC(s12).length, pct: s12.length ? (100 * withC(s12).length) / s12.length : null,
    amounts: amts.length ? { min: Math.min(...amts), max: Math.max(...amts), median: median(amts) } : null,
    periods: periods(effective).map((p) => { const a = soldIn(ls, p); return { label: p.label, sales: a.length, withConcessions: withC(a).length, pct: a.length ? (100 * withC(a).length) / a.length : null } }),
  }
}
/** A suggestion for "seller-paid financial assistance prevalent": concessions on a fifth of sales or more, overall or in any period. */
export const suggestAssistancePrevalent = (c: ConcessionStats) => (c.pct ?? 0) >= 20 || c.periods.some((p) => (p.pct ?? 0) >= 20)

export interface ReoStats { start: string; end: string; sales: number; reo: number; short: number; activeReo: number }
export function reoStats(ls: Listing[], effective: string): ReoStats {
  const s12 = soldIn(ls, { start: monthsBefore(effective, 12), end: effective })
  return {
    start: monthsBefore(effective, 12), end: effective, sales: s12.length, reo: s12.filter(isREO).length, short: s12.filter(isShortSale).length,
    activeReo: ls.filter((l) => activeAt(l, effective) && isREO(l)).length,
  }
}

// ------------------------------------------------------------------ monthly trend
export interface MonthPoint { label: string; start: string; end: string; sales: number; medSalePrice: number | null; medPricePerSqft: number | null; medDom: number | null; medSaleToList: number | null; actives: number; supply: number | null }
export function monthlySeries(ls: Listing[], effective: string, months = 12): MonthPoint[] {
  const out: MonthPoint[] = []
  for (let k = months; k >= 1; k--) {
    const start = monthsBefore(effective, k)
    const end = k === 1 ? effective : monthsBefore(effective, k - 1)
    const s = soldIn(ls, { start, end })
    out.push({
      label: end.slice(0, 7), start, end, sales: s.length, medSalePrice: med(s.map((l) => l.soldPrice)),
      medPricePerSqft: med(s.filter((l) => (l.gla ?? 0) > 0).map((l) => l.soldPrice! / l.gla!)), medDom: med(s.map((l) => l.dom)),
      medSaleToList: med(s.filter((l) => (l.listPrice ?? 0) > 0).map((l) => (l.soldPrice! / l.listPrice!) * 100)),
      actives: ls.filter((l) => activeAt(l, end)).length, supply: null,
    })
  }
  // months of supply: active listings at month end over the average monthly sales of the last three months
  out.forEach((m, i) => { const w = out.slice(Math.max(0, i - 2), i + 1); const rate = w.reduce((a, x) => a + x.sales, 0) / w.length; m.supply = rate > 0 ? m.actives / rate : null })
  return out
}

/** Slope of a straight line through monthly values, as a percent of their average, per month. */
export function trendPctPerMonth(values: (number | null)[]): number | null {
  const pts = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v !== null && Number.isFinite(p.v))
  if (pts.length < 3) return null
  const mx = mean(pts.map((p) => p.i)); const my = mean(pts.map((p) => p.v))
  let sxx = 0, sxy = 0
  for (const p of pts) { sxx += (p.i - mx) ** 2; sxy += (p.i - mx) * (p.v - my) }
  return my === 0 || sxx === 0 ? null : ((sxy / sxx) / my) * 100
}

// ------------------------------------------------------------------ wording
const usd = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`
const pct1 = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(1)}%`)
const us = (d: string) => `${d.slice(5, 7)}/${d.slice(8, 10)}/${d.slice(0, 4)}`
const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export interface TrendSummary { n: number; medSalePrice: number | null; medDom: number | null; supply: number | null; actives: number; pricePerMonth: number | null; supplyPerMonth: number | null; domPerMonth: number | null }
export function trendSummary(ls: Listing[], effective: string, months = 12): TrendSummary | null {
  const start = monthsBefore(effective, months)
  const solds = soldIn(ls, { start, end: effective })
  if (solds.length < 3) return null
  const series = monthlySeries(ls, effective, months)
  const actives = ls.filter((l) => activeAt(l, effective)).length
  const rate = solds.length / months
  return {
    n: solds.length, medSalePrice: med(solds.map((l) => l.soldPrice)), medDom: med(solds.map((l) => l.dom)), actives,
    supply: rate > 0 && actives > 0 ? actives / rate : null,
    pricePerMonth: trendPctPerMonth(series.map((m) => m.medSalePrice)), supplyPerMonth: trendPctPerMonth(series.map((m) => m.supply)), domPerMonth: trendPctPerMonth(series.map((m) => m.medDom)),
  }
}

/** The paragraph for the market conditions comment, in plain words. */
export function marketNarrative(s: TrendSummary, months = 12): string {
  const out = [`${plural(s.n, 'competing sale')} closed in the last ${months} months, with a median sale price of ${usd(s.medSalePrice!)}.`]
  if (s.pricePerMonth !== null) out.push(`Monthly median prices moved ${signed(s.pricePerMonth)} per month over that time.`)
  if (s.supply !== null) {
    out.push(`With ${plural(s.actives, 'active listing')} on the effective date, that is ${s.supply.toFixed(1)} months of supply.`)
    if (s.supplyPerMonth !== null) out.push(`Months of supply moved ${signed(s.supplyPerMonth)} per month.`)
  }
  if (s.medDom !== null) {
    out.push(`The median marketing time of those sales was ${Math.round(s.medDom)} days.`)
    if (s.domPerMonth !== null) out.push(`Marketing time moved ${signed(s.domPerMonth)} per month.`)
  }
  return out.join(' ')
}

export function concessionNarrative(c: ConcessionStats, source: string): string {
  const range = `between ${us(c.start)} and ${us(c.end)}`
  if (!c.sales) return `${source} shows no closed sales in the market area ${range}.`
  let text = `${source} shows ${c.withConcessions} of ${c.sales} closed sales (${pct1(c.pct)}) in the market area ${range} with seller concessions.`
  text += c.amounts ? ` Amounts ran from ${usd(c.amounts.min)} to ${usd(c.amounts.max)}, with a median of ${usd(c.amounts.median)}.` : ' No dollar amounts were reported.'
  const names = ['7 to 12 months before the effective date', '4 to 6 months before', 'the last 3 months']
  c.periods.forEach((p, i) => { text += p.sales ? ` In ${names[i]}: ${p.withConcessions} of ${p.sales} (${pct1(p.pct)}).` : ` There were no closed sales in ${names[i]}.` })
  return text
}

export function reoNarrative(r: ReoStats, source: string): string {
  const range = `between ${us(r.start)} and ${us(r.end)}`
  if (!r.reo && !r.short) return `${source} shows no REO or short sales in the market area ${range}.`
  const parts: string[] = []
  if (r.reo) parts.push(`${plural(r.reo, 'REO sale')} (${pct1(r.sales ? (100 * r.reo) / r.sales : null)} of closed sales)`)
  if (r.short) parts.push(`${plural(r.short, 'short sale')} (${pct1(r.sales ? (100 * r.short) / r.sales : null)})`)
  let text = `${source} shows ${parts.join(' and ')} in the market area ${range}.`
  if (r.activeReo) text += ` ${plural(r.activeReo, 'REO listing')} ${r.activeReo === 1 ? 'is' : 'are'} active now.`
  return text
}

// ------------------------------------------------------------------ characteristics and neighborhood
export interface BucketStats { bucket: Bucket; label: string; n: number; low: number | null; median: number | null; high: number | null; avg: number | null; medGla: number | null; medLot: number | null; medAge: number | null }
/** Active and pending as of the effective date; sold and off market over the last 12 months. */
export function characteristics(ls: Listing[], effective: string): BucketStats[] {
  const from = monthsBefore(effective, 12)
  const age = (l: Listing) => (l.yearBuilt && l.yearBuilt > 1800 ? Math.max(0, Number(effective.slice(0, 4)) - l.yearBuilt) : null)
  const offDate = (l: Listing) => [l.withdrawnDate, l.expirationDate, l.terminationDate, l.offMarketDate].filter(Boolean).sort().pop() ?? null
  const groups: Record<Bucket, Listing[]> = {
    active: ls.filter((l) => activeAt(l, effective)),
    pending: ls.filter((l) => bucketOf(l) === 'pending' || (l.contractDate && l.contractDate <= effective && !l.closeDate && !OFF.test(l.status) && !/sold|closed/i.test(l.status))),
    sold: soldIn(ls, { start: from, end: effective }),
    offmarket: ls.filter((l) => OFF.test(l.status) && (offDate(l) ?? '') > from && (offDate(l) ?? '') <= effective),
  }
  const label: Record<Bucket, string> = { active: 'Active', pending: 'Pending', sold: 'Sold', offmarket: 'Off market' }
  return (['active', 'pending', 'sold', 'offmarket'] as Bucket[]).map((b) => {
    const g = [...new Map(groups[b].map((l) => [l.id, l])).values()]
    const price = g.map((l) => (b === 'sold' ? l.soldPrice : l.listPrice ?? l.origListPrice)).filter((x): x is number => !!x && x > 0)
    return {
      bucket: b, label: label[b], n: g.length, low: price.length ? Math.min(...price) : null, high: price.length ? Math.max(...price) : null,
      median: price.length ? median(price) : null, avg: price.length ? mean(price) : null,
      medGla: med(g.map((l) => (l.gla ?? 0) > 0 ? l.gla : null)), medLot: med(g.map((l) => (l.lotSize ?? 0) > 0 ? l.lotSize : null)), medAge: med(g.map(age)),
    }
  })
}

export interface Predominant { value: number; lo: number; hi: number; count: number; share: number }
export interface NeighborhoodSummary {
  n: number; priceLow: number | null; priceHigh: number | null; pricePredominant: Predominant | null
  ageLow: number | null; ageHigh: number | null; agePredominant: Predominant | null
}
/** One-unit housing figures from closed sales in the last 12 months: price range and predominant price, age range and predominant age. */
export function neighborhoodSummary(ls: Listing[], effective: string, opts: { priceBin?: number; ageBin?: number } = {}): NeighborhoodSummary {
  const priceBin = opts.priceBin ?? 10000
  const ageBin = opts.ageBin ?? 5
  const solds = soldIn(ls, { start: monthsBefore(effective, 12), end: effective })
  const prices = solds.map((l) => l.soldPrice!)
  const year = Number(effective.slice(0, 4))
  const ages = solds.filter((l) => l.yearBuilt && l.yearBuilt >= 1800 && l.yearBuilt <= year + 1).map((l) => Math.max(0, year - l.yearBuilt!))
  // The predominant range is the most common bin; ties go to the bin nearest the median.
  const predominant = (vals: number[], bin: number): Predominant | null => {
    if (!vals.length) return null
    const m = median(vals)
    const counts = new Map<number, number>()
    for (const v of vals) { const b = Math.floor(v / bin) * bin; counts.set(b, (counts.get(b) ?? 0) + 1) }
    const [lo, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || Math.abs(a[0] + bin / 2 - m) - Math.abs(b[0] + bin / 2 - m))[0]
    return { value: lo + bin / 2, lo, hi: lo + bin, count, share: (100 * count) / vals.length }
  }
  return {
    n: solds.length, priceLow: prices.length ? Math.min(...prices) : null, priceHigh: prices.length ? Math.max(...prices) : null, pricePredominant: predominant(prices, priceBin),
    ageLow: ages.length ? Math.min(...ages) : null, ageHigh: ages.length ? Math.max(...ages) : null, agePredominant: predominant(ages, ageBin),
  }
}
