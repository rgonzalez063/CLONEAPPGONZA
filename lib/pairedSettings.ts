import { findPairs, type FeatureDef, type MatchRule, type Property } from '@/engines'
import { FEATURES, resolveFeature } from './features'

/** One feature's role in paired sales: must it match (and how closely) for two sales to form a pair. */
export interface PairedFeatureSetting { enabled: boolean; rule: MatchRule }
export interface PairedSettings {
  features: Record<string, PairedFeatureSetting>
  removeOutliers: boolean // drop pair rates beyond 1.5 x the interquartile range
}

export interface Candidate { key: string; label: string; unit: 'number' | 'yesno' | 'choice'; enabled: boolean; rule: MatchRule }
const c = (key: string, label: string, unit: Candidate['unit'], enabled: boolean, rule: MatchRule): Candidate => ({ key, label, unit, enabled, rule })

/** Everything paired sales can be told to match on. The defaults reproduce the real HARMLS sample best. */
export const CANDIDATES: Candidate[] = [
  c('gla', 'GLA', 'number', true, { type: 'pct', pct: 5 }),
  c('lot_size', 'Lot size', 'number', true, { type: 'pct', pct: 5 }),
  c('baths_full', 'Full baths', 'number', true, { type: 'exact' }),
  c('baths_half', 'Half baths', 'number', true, { type: 'exact' }),
  c('beds', 'Bedrooms', 'number', true, { type: 'identicalOrBothGreater', n: 3 }),
  c('stories', 'Stories', 'number', true, { type: 'exact' }),
  c('garage', 'Garage spaces', 'number', true, { type: 'exact' }),
  c('pool', 'Pool', 'yesno', true, { type: 'exact' }),
  c('style_code', 'Style', 'choice', true, { type: 'exact' }),
  c('carport', 'Carport spaces', 'number', false, { type: 'exact' }),
  c('fireplaces', 'Fireplaces', 'number', false, { type: 'identicalOrBothGreater', n: 0 }),
  c('age', 'Age', 'number', false, { type: 'pct', pct: 10 }),
  c('rooms', 'Total rooms', 'number', false, { type: 'exact' }),
  c('hoa', 'HOA exists', 'yesno', false, { type: 'exact' }),
  c('public_sewer', 'Public sewer', 'yesno', false, { type: 'exact' }),
  c('public_water', 'Public water', 'yesno', false, { type: 'exact' }),
]

export const defaultPairedSettings = (): PairedSettings => ({
  features: Object.fromEntries(CANDIDATES.map((x) => [x.key, { enabled: x.enabled, rule: x.rule }])),
  removeOutliers: true,
})

const candidate = (key: string) => CANDIDATES.find((x) => x.key === key)
const defFor = (key: string): FeatureDef | null => resolveFeature(key) ?? (candidate(key) ? { key, label: candidate(key)!.label, unit: 'each', get: (p: Property) => p.values[key] ?? null, rule: candidate(key)!.rule } : null)

/** The feature definitions paired sales must match on, with the rules from the settings. */
export function matchFeatures(s: PairedSettings | undefined): FeatureDef[] {
  const settings = s ?? defaultPairedSettings()
  const out: FeatureDef[] = []
  for (const cand of CANDIDATES) {
    const f = settings.features[cand.key] ?? { enabled: cand.enabled, rule: cand.rule }
    const d = defFor(cand.key)
    if (d && f.enabled) out.push({ ...d, rule: f.rule })
  }
  return out
}

/** The studied feature keeps its own rule (it decides what counts as "differs"), even if it is not a must-match feature. */
export function studiedWithRule(def: FeatureDef, s: PairedSettings | undefined): FeatureDef {
  const f = (s ?? defaultPairedSettings()).features[def.key]
  return f ? { ...def, rule: f.rule } : def
}

export function describeRule(r: MatchRule, unit = ''): string {
  switch (r.type) {
    case 'exact': return 'exactly the same'
    case 'pct': return `within ${r.pct}%`
    case 'abs': return `within ${r.tol}${unit ? ' ' + unit : ''}`
    case 'identicalOrBothGreater': return `the same, or both more than ${r.n}`
  }
}

/** How many pairs each feature would find per dataset under these settings. */
export function pairCounts(datasets: { name: string; props: Property[] }[], keys: string[], s: PairedSettings | undefined): { key: string; label: string; counts: number[] }[] {
  const all = matchFeatures(s)
  return keys.flatMap((k) => {
    const f = FEATURES[k] ?? resolveFeature(k)
    if (!f) return []
    const studied = studiedWithRule(f, s)
    return [{ key: k, label: f.label, counts: datasets.map((d) => findPairs(d.props, studied, all).length) }]
  })
}

export function validateRule(r: MatchRule): string | null {
  if (r.type === 'pct' && !(r.pct >= 0 && r.pct <= 100)) return 'A percentage must be between 0 and 100.'
  if (r.type === 'abs' && !(r.tol >= 0)) return 'A tolerance cannot be negative.'
  if (r.type === 'identicalOrBothGreater' && !(r.n >= 0)) return 'The number cannot be negative.'
  return null
}
