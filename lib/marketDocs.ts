import { characteristics, concessionNarrative, concessionStats, marketNarrative, mc1004, neighborhoodSummary, reoNarrative, reoStats, suggestAssistancePrevalent, trendSummary, type Listing } from '@/engines'
import type { Block } from './documents'

const usd = (v: number | null) => (v === null ? '-' : `$${Math.round(v).toLocaleString('en-US')}`)
const n1 = (v: number | null, d = 0) => (v === null ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }))
const pc = (v: number | null, d = 1) => (v === null ? '-' : `${v.toFixed(d)}%`)

/** The market conditions document for the workfile: the 1004MC table, the conclusions, the wording and the supporting summaries. */
export function buildMarketDoc(
  listings: Listing[], effective: string, subject: string, notes: Record<string, string | boolean | null>, defaultSource: string, neighborhood?: Listing[],
): Block[] {
  const source = String(notes.source || defaultSource || 'The MLS')
  const mc = mc1004(listings, effective)
  const conc = concessionStats(listings, effective)
  const reo = reoStats(listings, effective)
  const trend = trendSummary(listings, effective)
  const assist = typeof notes.assist === 'boolean' ? notes.assist : suggestAssistancePrevalent(conc)
  const calls = [['Property values', 'values'], ['Demand / supply', 'demand'], ['Marketing time', 'marketing']].filter(([, k]) => notes[k])
  const hood = neighborhoodSummary(neighborhood?.length ? neighborhood : listings, effective)
  const out: Block[] = [
    { kind: 'title', text: 'Market conditions' },
    { kind: 'p', text: `Subject: ${subject}\nEffective date: ${effective}\nListings analyzed: ${listings.length}` },
    {
      kind: 'table', head: ['Inventory analysis and median comparables', ...mc.map((c) => `${c.label} (to ${c.end})`)],
      rows: [
        ['Total comparable sales (settled)', ...mc.map((c) => String(c.sales))],
        ['Absorption rate (sales per month)', ...mc.map((c) => n1(c.absorption, 2))],
        ['Total comparable active listings', ...mc.map((c) => String(c.actives))],
        ['Months of housing supply', ...mc.map((c) => n1(c.monthsSupply, 1))],
        ['Median comparable sale price', ...mc.map((c) => usd(c.medSalePrice))],
        ['Median comparable sales days on market', ...mc.map((c) => n1(c.medDom))],
        ['Median comparable list price (actives)', ...mc.map((c) => usd(c.medListPrice))],
        ['Median sale price as % of list price', ...mc.map((c) => pc(c.medSaleToList))],
        ['Sales with seller concessions', ...mc.map((c) => pc(c.concessionPct, 0))],
      ],
    },
    { kind: 'p', text: `Seller-paid financial assistance prevalent: ${assist ? 'Yes' : 'No'}` },
  ]
  if (calls.length) out.push({ kind: 'table', head: ['Appraiser conclusion', ''], rows: calls.map(([label, k]) => [label, String(notes[k])]) })
  out.push({ kind: 'h', text: 'Market conditions comment' })
  out.push({ kind: 'p', text: [trend ? marketNarrative(trend) : 'Too few sales in the last 12 months to describe a trend.', String(notes.extra ?? '')].filter(Boolean).join(' ') })
  out.push({ kind: 'h', text: 'Seller concessions' }, { kind: 'p', text: concessionNarrative(conc, source) })
  out.push({ kind: 'h', text: 'REO and short sales' }, { kind: 'p', text: reoNarrative(reo, source) })
  out.push({ kind: 'h', text: 'Neighborhood one-unit housing (closed sales, last 12 months)' })
  out.push({
    kind: 'table', head: ['', 'Low', 'High', 'Predominant'],
    rows: [
      ['Price', usd(hood.priceLow), usd(hood.priceHigh), hood.pricePredominant ? `${usd(hood.pricePredominant.lo)} to ${usd(hood.pricePredominant.hi)}` : '-'],
      ['Age (years)', n1(hood.ageLow), n1(hood.ageHigh), hood.agePredominant ? `${hood.agePredominant.lo} to ${hood.agePredominant.hi}` : '-'],
    ],
  })
  out.push({ kind: 'h', text: 'Market characteristics' })
  out.push({
    kind: 'table', head: ['Status', 'Count', 'Low', 'Median', 'High', 'Median GLA', 'Median age'],
    rows: characteristics(listings, effective).map((c) => [c.label, String(c.n), usd(c.low), usd(c.median), usd(c.high), n1(c.medGla), n1(c.medAge)]),
  })
  out.push({ kind: 'p', text: `The market conditions data came from ${source} with an effective date of ${effective}.` })
  return out
}
