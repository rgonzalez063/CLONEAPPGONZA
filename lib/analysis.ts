import { resolveFeature } from './features'
import { GROUPS, groupKey } from './groups'
import { matchFeatures, studiedWithRule } from './pairedSettings'
import {
  depreciatedCostBySize, groupedData, modelPrices, CONDITION_AGE, QUALITY_LIFESPAN, pairedSales, regression, sensitivity, median,
  type FeatureDef, type MethodResult, type Property,
} from '@/engines'
import type { Session, WidgetState } from './store'
import { applyTransactional, defaultTransactional, type TransactionalReport } from './transactional'

const EXTERIOR_OPTIONS = GROUPS.filter((g) => g.id === 'patios' || g.id === 'exterior').flatMap((g) => g.options.filter((o) => o.label !== 'None').map((o) => groupKey(g.id, o.label)))

/** One number standing for which patio, porch and outbuilding options a property has, so "same exterior features" is an exact match. */
export function exteriorSignature(values: Record<string, number | null>): number {
  let sig = 0
  EXTERIOR_OPTIONS.forEach((k, i) => { if (values[k]) sig += 2 ** i })
  return sig
}

export interface DatasetResults { slot: number; name: string; count: number; results: MethodResult[] }
export interface PreparedDataset { slot: number; name: string; props: Property[]; report: TransactionalReport; excludedAfterEffective: number }

/** Apply the transactional adjustments (filters, concessions, time trend) once per dataset. */
export function prepareDatasets(session: Session): PreparedDataset[] {
  const settings = session.transactional ?? defaultTransactional
  return session.datasets
    .filter((d) => d.properties.length > 0)
    .map((d) => {
      const t = applyTransactional(d.properties, settings, session.effectiveDate)
      return {
        slot: d.slot, name: d.name, report: t.report, excludedAfterEffective: d.excludedAfterEffective,
        props: t.properties.map((p) => ({ id: p.id, price: p.adjPrice, values: { ...p.values, ext_sig: exteriorSignature(p.values) } })),
      }
    })
}

/** Features already decided and modeled (not the one being computed). */
function modeled(session: Session, exceptKey: string) {
  return Object.entries(session.widgets)
    .filter(([k, w]) => k !== exceptKey && w.model && w.chosen !== null)
    .map(([k, w]) => ({ feature: resolveFeature(k) as FeatureDef, rate: w.chosen as number }))
    .filter((x) => x.feature)
}

const SUBJECT_FIELDS: Record<string, keyof NonNullable<Session['subject']>> = {
  gla: 'gla', lot_size: 'lot_size', baths_full: 'baths_full', baths_half: 'baths_half', garage: 'garage', stories: 'stories',
}

/** The subject's value for a feature: from the subject form when it has the field, else the widget's own value. */
export function subjectValue(session: Session, key: string): number | null {
  const field = SUBJECT_FIELDS[key]
  if (field && session.subject) return (session.subject[field] as number | null) ?? null
  const w = session.widgets[key]
  if (w && w.subject !== undefined) return w.subject
  return key.startsWith('grp:') ? 1 : null // a group option: assume the subject has it until told otherwise
}

export function subjectValues(session: Session): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const k of [...Object.keys(SUBJECT_FIELDS), ...Object.keys(session.widgets)]) out[k] = subjectValue(session, k)
  return out
}

export interface GroupSpec { from: number; to: number }
/**
 * The two grouped-data analyses for a feature, built around the median of the first dataset (the closest sales).
 * Counts compare one step below the median with the median, then the median with one step above. Sizes compare
 * 10% below the median with the median, then 10% below with 3% above against 3% below with 10% above.
 * Yes/no features compare "does not have it" with "has it" once.
 */
export function groupAnalyses(unit: string, median0: number, lowest: number): [GroupSpec, GroupSpec][] {
  if (unit === 'yes/no') return [[{ from: 0, to: 0 }, { from: 1, to: 1 }]]
  if (unit === 'each') {
    const m = Math.round(median0)
    const down: [GroupSpec, GroupSpec] = m - 1 >= lowest ? [{ from: m - 1, to: m - 1 }, { from: m, to: m }] : [{ from: m, to: m }, { from: m + 1, to: m + 1 }]
    return [down, [{ from: m, to: m }, { from: m + 1, to: m + 1 }]]
  }
  const step = unit === 'years' ? 0.5 : 1
  const r = (v: number) => Math.round(v / step) * step
  const at = (pct: number) => r(median0 * (1 + pct / 100))
  const m = r(median0)
  return [
    [{ from: at(-10), to: m }, { from: m, to: at(10) }],
    [{ from: at(-10), to: at(3) }, { from: at(-3), to: at(10) }],
  ]
}

/** Depreciated cost of a size feature from the appraiser's own cost figures. Only GLA has it for now. */
export function depreciatedCostResult(session: Session, key: string): MethodResult | null {
  const s = session.subject
  if (key !== 'gla' || !s || !s.gla || !s.costPerSqft) return null
  const lifespan = QUALITY_LIFESPAN[s.quality ?? ''] ?? 70
  const effectiveAge = s.effectiveAge ?? (s.condition ? CONDITION_AGE[s.condition] : undefined)
  if (effectiveAge === undefined || effectiveAge === null) return null
  const r = depreciatedCostBySize({ subjectSize: s.gla, costPerSqft: s.costPerSqft, costChangePerStep: s.costChangePerStep ?? 0, kitchenPct: s.kitchenPct ?? 0, effectiveAge, lifespan })
  if (!r) return null
  return {
    method: 'DC', variant: '', value: r.value, mae: null, status: 'ok',
    detail: { step1: r.rates[0], step2: r.rates[1], effectiveAge, lifespan },
  }
}

/** Run every method for one feature on every dataset that has data. */
export function computeFeature(session: Session, key: string, prepared: PreparedDataset[]): DatasetResults[] {
  const base = resolveFeature(key)
  if (!base) return []
  const feature = studiedWithRule(base, session.pairedSettings)
  const mustMatch = matchFeatures(session.pairedSettings)
  const subj = subjectValues(session)
  const sv = subj[key]
  const decided = modeled(session, key)
  const own = (d: PreparedDataset) => d.props.map((p) => feature.get(p)).filter((v): v is number => v !== null)
  const first = prepared.map(own).find((v) => v.length >= 3)
  const primaryMedian = first ? median(first) : null
  const primaryMin = first ? Math.min(...first) : null
  const cost = depreciatedCostResult(session, key)
  return prepared
    .map((d, di) => {
      let props = d.props
      if (decided.length) props = modelPrices(props, decided, subj)
      const values = props.map((p) => feature.get(p)).filter((v): v is number => v !== null)
      const results: MethodResult[] = []
      if (values.length >= 3) {
        const analyses = groupAnalyses(feature.unit, primaryMedian ?? median(values), primaryMin ?? Math.min(...values))
        const grouped = analyses.flatMap(([g1, g2], n) => [
          { ...groupedData(props, feature, g1, g2, 'avg'), variant: n ? 'avg 2' : 'avg' },
          { ...groupedData(props, feature, g1, g2, 'median'), variant: n ? 'median 2' : 'median' },
        ])
        const med = median(values)
        results.push(
          ...grouped,
          ...pairedSales(props, feature, mustMatch, { removeOutliers: session.pairedSettings?.removeOutliers ?? true }),
          ...regression(props, feature),
        )
        if (sv !== null && sv !== undefined) {
          const maxRate = Math.max(1, (Math.max(...props.map((p) => p.price)) / Math.max(1e-9, Math.abs(med))) * 3)
          results.push(sensitivity(props, feature, sv, { min: 0, max: maxRate, step: maxRate / 400, trimPct: 5 }))
        }
      }
      if (cost && di === 0) results.push(cost)
      return { slot: d.slot, name: d.name, count: props.length, results }
    })
}

export const defaultWidget = (): WidgetState => ({ chosen: null, done: false, locked: false, model: false, low: null, high: null })
