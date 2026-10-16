// Figures for the dashboard, worked out from one session in the browser. Pure functions over what the results page already computes.
import { median, mean, quantile } from '@/engines'
import type { DatasetResults, PreparedDataset } from './analysis'
import { resolveFeature } from './features'
import type { Session } from './types'

export interface Stats { n: number; min: number; q1: number; median: number; q3: number; max: number; mean: number }
export function stats(values: (number | null | undefined)[]): Stats | null {
  const v = values.filter((x): x is number => x !== null && x !== undefined && Number.isFinite(x))
  if (!v.length) return null
  return { n: v.length, min: Math.min(...v), q1: quantile(v, 0.25), median: median(v), q3: quantile(v, 0.75), max: Math.max(...v), mean: mean(v) }
}

export interface Bin { lo: number; hi: number; count: number }
/** Equal-width bins from the smallest to the largest value. */
export function histogram(values: number[], bins = 10): Bin[] {
  if (!values.length) return []
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  if (lo === hi) return [{ lo, hi, count: values.length }]
  const w = (hi - lo) / bins
  const out: Bin[] = Array.from({ length: bins }, (_, i) => ({ lo: lo + i * w, hi: lo + (i + 1) * w, count: 0 }))
  for (const x of values) out[Math.min(bins - 1, Math.floor((x - lo) / w))].count++
  return out
}

/** How many properties have each whole value of a count feature (bedrooms, baths, garage spaces). */
export function counts(values: (number | null)[]): { value: number; count: number }[] {
  const m = new Map<number, number>()
  for (const v of values) if (v !== null && Number.isFinite(v)) m.set(v, (m.get(v) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([value, count]) => ({ value, count }))
}

export interface DatasetMetrics {
  slot: number; name: string; n: number
  price: Stats | null; perSqft: Stats | null; gla: Stats | null; lot: Stats | null; age: Stats | null
  priceBins: Bin[]; beds: ReturnType<typeof counts>; bathsFull: ReturnType<typeof counts>; garage: ReturnType<typeof counts>
  byMonth: { month: string; sales: number; medianPrice: number | null }[]
  concessionPct: number | null
  points: { x: number; y: number; id: string }[]
}

/** Figures for each dataset of a session: prices after the transactional adjustments, sizes, ages, and sales by month. */
export function propertyMetrics(session: Session, prepared: PreparedDataset[]): DatasetMetrics[] {
  return prepared.map((d) => {
    const raw = session.datasets.find((x) => x.slot === d.slot)?.properties.filter((p) => !p.deleted) ?? []
    const price = d.props.map((p) => p.price)
    const months = new Map<string, number[]>()
    for (const p of raw) { const m = p.saleDate.slice(0, 7); months.set(m, [...(months.get(m) ?? []), p.salePrice]) }
    return {
      slot: d.slot, name: d.name, n: d.props.length,
      price: stats(price), perSqft: stats(d.props.map((p) => (p.values.gla ? p.price / p.values.gla : null))),
      gla: stats(d.props.map((p) => p.values.gla)), lot: stats(d.props.map((p) => p.values.lot_size)), age: stats(d.props.map((p) => p.values.age)),
      priceBins: histogram(price), beds: counts(d.props.map((p) => p.values.beds)), bathsFull: counts(d.props.map((p) => p.values.baths_full)), garage: counts(d.props.map((p) => p.values.garage)),
      byMonth: [...months.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, v]) => ({ month, sales: v.length, medianPrice: median(v) })),
      concessionPct: raw.length ? (100 * raw.filter((p) => (p.meta?.concessions ?? 0) > 0).length) / raw.length : null,
      points: d.props.filter((p) => p.values.gla).map((p) => ({ x: p.values.gla as number, y: p.price, id: p.id })),
    }
  })
}

export interface SimilarSale { dataset: string; id: string; price: number; gla: number | null; lot: number | null; age: number | null; distance: number; perSqft: number | null }
/** The sales closest to the subject in size, lot and age. A lower distance is more alike; it is a way to look, not a method. */
export function mostSimilar(session: Session, prepared: PreparedDataset[], limit = 6): SimilarSale[] {
  const s = session.subject
  if (!s?.gla) return []
  const rows: SimilarSale[] = []
  for (const d of prepared) for (const p of d.props) {
    const gla = p.values.gla
    if (!gla) continue
    const parts = [Math.abs(gla - s.gla) / s.gla * 2]
    const lot = p.values.lot_size
    if (lot && s.lot_size) parts.push(Math.abs(lot - s.lot_size) / s.lot_size)
    rows.push({ dataset: d.name, id: p.id, price: p.price, gla, lot: lot ?? null, age: p.values.age ?? null, distance: parts.reduce((a, b) => a + b, 0) / parts.length, perSqft: p.price / gla })
  }
  return rows.sort((a, b) => a.distance - b.distance).slice(0, limit)
}

export interface FeatureRow { key: string; label: string; chosen: number | null; done: boolean; results: number; low: number | null; high: number | null; median: number | null; insideRange: boolean | null }
export interface SessionMetrics {
  features: FeatureRow[]; done: number; total: number
  data: { datasets: { name: string; kept: number; loaded: number; removed: number; afterEffective: number }[]; trend: { name: string; model: string; r2: number | null; changePerMonthPct: number | null }[] }
}

/** Where the adjustments stand and how sound the data is. */
export function sessionMetrics(session: Session, prepared: PreparedDataset[], computed: Record<string, DatasetResults[]>): SessionMetrics {
  const features = Object.entries(session.widgets).map(([key, w]): FeatureRow => {
    const vals = (computed[key] ?? []).flatMap((d) => d.results).filter((r) => r.status === 'ok' && r.value !== null).map((r) => r.value as number)
    const low = vals.length ? Math.min(...vals) : null
    const high = vals.length ? Math.max(...vals) : null
    return {
      key, label: resolveFeature(key)?.label ?? key, chosen: w.chosen, done: w.done, results: vals.length, low, high, median: vals.length ? median(vals) : null,
      insideRange: w.chosen !== null && low !== null && high !== null ? w.chosen >= low && w.chosen <= high : null,
    }
  })
  const datasets = prepared.map((d) => {
    const loaded = session.datasets.find((x) => x.slot === d.slot)?.properties.filter((p) => !p.deleted).length ?? 0
    return { name: d.name, loaded, kept: d.props.length, removed: loaded - d.props.length, afterEffective: d.excludedAfterEffective }
  })
  const trend = prepared.map((d) => {
    const t = d.report.trend
    const mean = d.props.length ? d.props.reduce((a, p) => a + p.price, 0) / d.props.length : 0
    return {
      name: d.name, model: d.report.timeModel, r2: t?.r2 ?? null,
      changePerMonthPct: d.report.timeModel === 'linear' && t && mean ? ((t.coefficients[0] * 30.44) / mean) * 100 : null,
    }
  })
  return { features, done: features.filter((f) => f.done && f.chosen !== null).length, total: features.length, data: { datasets, trend } }
}
