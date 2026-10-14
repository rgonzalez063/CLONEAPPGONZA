import { resolveFeature } from './features'
import { matchFeatures, studiedWithRule } from './pairedSettings'
import {
  groupedData, modelPrices, pairedSales, regression, sensitivity, median,
  type FeatureDef, type MethodResult, type Property,
} from '@/engines'
import type { Session, WidgetState } from './store'
import { applyTransactional, defaultTransactional, type TransactionalReport } from './transactional'

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
        props: t.properties.map((p) => ({ id: p.id, price: p.adjPrice, values: p.values })),
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

/** Run every method for one feature on every dataset that has data. */
export function computeFeature(session: Session, key: string, prepared: PreparedDataset[]): DatasetResults[] {
  const base = resolveFeature(key)
  if (!base) return []
  const feature = studiedWithRule(base, session.pairedSettings)
  const mustMatch = matchFeatures(session.pairedSettings)
  const subj = subjectValues(session)
  const sv = subj[key]
  const decided = modeled(session, key)
  return prepared
    .map((d) => {
      let props = d.props
      if (decided.length) props = modelPrices(props, decided, subj)
      const values = props.map((p) => feature.get(p)).filter((v): v is number => v !== null)
      const results: MethodResult[] = []
      if (values.length >= 3) {
        const med = median(values)
        const spread = Math.max(1, med * 0.1)
        // Yes/no features compare "has it" (1) against "does not" (0); numbers use groups around the median.
        const binary = feature.unit === 'yes/no'
        const g1 = binary ? { from: 0, to: 0 } : { from: Math.min(...values), to: med - spread / 2 }
        const g2 = binary ? { from: 1, to: 1 } : { from: med + spread / 2, to: Math.max(...values) }
        results.push(
          groupedData(props, feature, g1, g2, 'avg'),
          groupedData(props, feature, g1, g2, 'median'),
          ...pairedSales(props, feature, mustMatch, { removeOutliers: session.pairedSettings?.removeOutliers ?? true }),
          ...regression(props, feature),
        )
        if (sv !== null && sv !== undefined) {
          const maxRate = Math.max(1, (Math.max(...props.map((p) => p.price)) / Math.max(1e-9, Math.abs(med))) * 3)
          results.push(sensitivity(props, feature, sv, { min: 0, max: maxRate, step: maxRate / 400, trimPct: 3 }))
        }
      }
      return { slot: d.slot, name: d.name, count: props.length, results }
    })
}

export const defaultWidget = (): WidgetState => ({ chosen: null, done: false, locked: false, model: false, low: null, high: null })
