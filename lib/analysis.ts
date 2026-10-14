import { FEATURES } from './features'
import { ALL_FEATURES } from './features'
import {
  groupedData, modelPrices, pairedSales, regression, sensitivity, median,
  type MethodResult, type Property,
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
    .map(([k, w]) => ({ feature: FEATURES[k], rate: w.chosen as number }))
    .filter((x) => x.feature)
}

export function subjectValues(session: Session): Record<string, number | null> {
  const s = session.subject
  if (!s) return {}
  return { gla: s.gla, lot_size: s.lot_size, baths_full: s.baths_full, garage: s.garage, stories: s.stories }
}

/** Run every method for one feature on every dataset that has data. */
export function computeFeature(session: Session, key: string, prepared: PreparedDataset[]): DatasetResults[] {
  const feature = FEATURES[key]
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
        results.push(
          groupedData(props, feature, { from: Math.min(...values), to: med - spread / 2 }, { from: med + spread / 2, to: Math.max(...values) }, 'avg'),
          groupedData(props, feature, { from: Math.min(...values), to: med - spread / 2 }, { from: med + spread / 2, to: Math.max(...values) }, 'median'),
          ...pairedSales(props, feature, ALL_FEATURES, { removeOutliers: true }),
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
