import type { FeatureDef, MethodResult } from '@/engines'
import type { DatasetResults } from './analysis'
import { money, perUnit } from './format'
import type { WidgetState } from './store'

export interface CommentOptions { range: boolean; methods: boolean; extra: string }
export const defaultCommentOptions: CommentOptions = { range: true, methods: true, extra: '' }

export const METHOD_NAMES: Record<MethodResult['method'], string> = {
  TPS: 'paired sales', GD: 'grouped data', OLS: 'ordinary least squares regression', ROLS: 'robust least squares regression',
  TS: 'Theil-Sen regression', LAD: 'least absolute deviation regression', LMS: 'least median of squares regression',
  RLMS: 'robust least median of squares regression', MODQ: 'modified quantile regression', SENS: 'sensitivity analysis',
}
const REGRESSION = new Set(['OLS', 'ROLS', 'TS', 'LAD', 'LMS', 'RLMS', 'MODQ'])

/** Results the appraiser kept: calculated, and not outside the limits they set on the widget. */
export function relevantResults(data: DatasetResults[], w: Pick<WidgetState, 'low' | 'high'>): MethodResult[] {
  return data.flatMap((d) => d.results).filter((r) =>
    r.status === 'ok' && r.value !== null && (w.low === null || r.value >= w.low) && (w.high === null || r.value <= w.high))
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

export function methodsPhrase(results: MethodResult[]): string {
  const names: string[] = []
  const methods = new Set(results.map((r) => r.method))
  const reg = [...methods].filter((m) => REGRESSION.has(m))
  for (const m of ['TPS', 'GD', 'SENS'] as const) if (methods.has(m)) names.push(METHOD_NAMES[m])
  if (reg.length >= 3) names.push(`${reg.length} types of simple regression`)
  else for (const m of reg) names.push(METHOD_NAMES[m as MethodResult['method']])
  return list(names)
}

export interface FeatureComment { feature: string; text: string }

/** One comment per finished feature. Wording is our own; the structure follows common appraisal practice. */
export function featureComment(
  feature: FeatureDef, w: WidgetState, data: DatasetResults[], o: CommentOptions = defaultCommentOptions,
): FeatureComment | null {
  if (!w.done || w.chosen === null) return null
  const kept = relevantResults(data, w)
  const parts = [`The ${feature.label} adjustment is ${money(w.chosen)}${perUnit(feature.unit)}.`]
  if (o.range && kept.length) {
    const vals = kept.map((r) => r.value as number)
    const lo = Math.min(...vals, w.chosen)
    const hi = Math.max(...vals, w.chosen)
    parts.push(`Among the results I kept after setting aside values I judged unrealistic, rates ran from ${money(lo)} to ${money(hi)}${perUnit(feature.unit)}.`)
  }
  if (o.methods && kept.length) parts.push(`The support comes from ${methodsPhrase(kept)}.`)
  if (o.extra.trim()) parts.push(o.extra.trim())
  return { feature: feature.label, text: parts.join(' ') }
}

export const TRANSACTIONAL_SENTENCE =
  'Before any feature adjustment, sales were adjusted in this order: property rights, financing terms, conditions of sale (distressed sales and seller concessions), and market conditions (time).'
