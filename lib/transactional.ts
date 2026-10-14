import { bestTrend, fitTrend, minPoints, type Trend, type TrendModel } from '@/engines'
import type { StoredProperty } from './importer'

export interface TransactionalSettings {
  removeLeasehold: boolean
  removeNonCash: boolean // owner / seller financed
  removeREO: boolean
  removeShortSale: boolean
  deductConcessions: boolean
  timeBasis: 'contract' | 'sale'
  timeModel: 'best' | TrendModel | 'none'
}
export const defaultTransactional: TransactionalSettings = {
  removeLeasehold: true, removeNonCash: true, removeREO: true, removeShortSale: true,
  deductConcessions: true, timeBasis: 'contract', timeModel: 'best',
}

export interface AdjustedProperty extends StoredProperty { adjPrice: number }
export interface TransactionalReport {
  removed: { leasehold: number; nonCash: number; reo: number; shortSale: number }
  timeModel: TrendModel | 'none'
  trend: Trend | null
  oldestDate: string | null
  pointsUsed: number
}

const dayNumber = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000)
const NON_CASH = /owner|seller\s*(carry|financ)|carryback/i
const REO = /\bREO\b|real\s+estate\s+owned|bank[\s-]?owned|foreclos/i
const SHORT = /short\s*sale/i

/**
 * Transactional adjustments in the required order: property rights, financing terms,
 * distressed sales, seller concessions, then market conditions (time).
 */
export function applyTransactional(
  all: StoredProperty[], s: TransactionalSettings, effectiveDate: string,
): { properties: AdjustedProperty[]; report: TransactionalReport } {
  const removed = { leasehold: 0, nonCash: 0, reo: 0, shortSale: 0 }
  let list = all.filter((p) => !p.deleted)
  if (s.removeLeasehold) { const n = list.length; list = list.filter((p) => !/lease/i.test(p.meta?.ownership ?? '')); removed.leasehold = n - list.length }
  if (s.removeNonCash) { const n = list.length; list = list.filter((p) => !NON_CASH.test(p.meta?.financing ?? '')); removed.nonCash = n - list.length }
  if (s.removeREO) { const n = list.length; list = list.filter((p) => !REO.test(p.meta?.special ?? '')); removed.reo = n - list.length }
  if (s.removeShortSale) { const n = list.length; list = list.filter((p) => !SHORT.test(p.meta?.special ?? '')); removed.shortSale = n - list.length }

  const base = list.map((p) => ({ ...p, adjPrice: p.salePrice - (s.deductConcessions ? p.meta?.concessions ?? 0 : 0) }))
  const dateOf = (p: StoredProperty) => (s.timeBasis === 'contract' ? p.contractDate ?? p.saleDate : p.saleDate)
  const report: TransactionalReport = { removed, timeModel: 'none', trend: null, oldestDate: null, pointsUsed: base.length }
  if (!base.length || s.timeModel === 'none') return { properties: base, report }

  const oldest = base.map(dateOf).sort()[0]
  report.oldestDate = oldest
  const d0 = dayNumber(oldest)
  const xs = base.map((p) => dayNumber(dateOf(p)) - d0)
  const ys = base.map((p) => p.adjPrice)
  const trend = s.timeModel === 'best' ? bestTrend(xs, ys) : fitTrend(xs, ys, s.timeModel)
  if (!trend) return { properties: base, report }
  report.trend = trend
  report.timeModel = trend.model
  const xEff = dayNumber(effectiveDate) - d0
  const adjusted = base.map((p, i) => ({ ...p, adjPrice: p.adjPrice + trend.predict(xEff) - trend.predict(xs[i]) }))
  return { properties: adjusted, report }
}

export { minPoints }
