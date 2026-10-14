import type { FeatureDef, MatchRule } from '@/engines'
import { GROUPS, compareKey, groupKey, groupOptions } from './groups'

const num = (k: string) => (p: { values: Record<string, number | null> }) => p.values[k] ?? null
const def = (key: string, label: string, unit: string, rule: MatchRule, valueKey = key): FeatureDef => ({ key, label, unit, get: num(valueKey), rule })

/** Features the user can analyze directly. The rule is how paired sales decides "same". */
export const FEATURES: Record<string, FeatureDef> = {
  gla: def('gla', 'GLA', 'sqft', { type: 'pct', pct: 5 }),
  lot_size: def('lot_size', 'Lot Size', 'sqft', { type: 'pct', pct: 5 }),
  baths_full: def('baths_full', 'Full Bath', 'each', { type: 'exact' }),
  baths_half: def('baths_half', 'Half Bath', 'each', { type: 'exact' }),
  garage: def('garage', 'Garage Spaces', 'each', { type: 'exact' }),
  carport: def('carport', 'Carport Spaces', 'each', { type: 'exact' }),
  stories: def('stories', 'Stories', 'each', { type: 'exact' }),
  beds: def('beds', 'Bedrooms', 'each', { type: 'identicalOrBothGreater', n: 3 }),
  fireplaces: def('fireplaces', 'Fireplace Count', 'each', { type: 'identicalOrBothGreater', n: 0 }),
  rooms: def('rooms', 'Total Rooms', 'each', { type: 'exact' }),
  age: def('age', 'Age', 'years', { type: 'pct', pct: 10 }),
  year_built: def('year_built', 'Year Built', 'years', { type: 'exact' }),
  pool: def('pool', 'Pool', 'yes/no', { type: 'exact' }),
  hoa: def('hoa', 'HOA Exists', 'yes/no', { type: 'exact' }),
  garage_attached: def('garage_attached', 'Garage: Attached', 'yes/no', { type: 'exact' }),
  garage_detached: def('garage_detached', 'Garage: Detached', 'yes/no', { type: 'exact' }),
  garage_builtin: def('garage_builtin', 'Garage: Built-In', 'yes/no', { type: 'exact' }),
}

/** Features that must match for a pair of sales to count in paired sales (besides the one studied). */
const MATCH_ONLY: FeatureDef[] = [def('ext_sig', 'Exterior features', 'choice', { type: 'exact' })]
// Default must-match set (see CANDIDATES in pairedSettings.ts). The paired sales settings screen lets the appraiser change it.
export const CORE_FEATURES = ['gla', 'lot_size', 'baths_full', 'baths_half', 'garage', 'stories', 'beds', 'pool', 'carport', 'fireplaces']
export const FEATURE_ORDER = ['lot_size', 'gla', 'baths_full', 'garage']
export const ALL_FEATURES: FeatureDef[] = [...CORE_FEATURES.map((k) => FEATURES[k]), ...MATCH_ONLY]

/** A feature by key: a plain feature, a group option ("has it"), or a comparison of two options. */
export function resolveFeature(key: string): FeatureDef | null {
  if (FEATURES[key]) return FEATURES[key]
  const g = /^grp:([^:]+):(.+)$/.exec(key)
  if (g) {
    const group = GROUPS.find((x) => x.id === g[1])
    return group ? { key, label: `${group.label}: ${g[2]}`, unit: 'yes/no', get: num(key), rule: { type: 'exact' } } : null
  }
  const c = /^cmp:([^:]+):(.+)\|(.+)$/.exec(key)
  if (c) {
    const group = GROUPS.find((x) => x.id === c[1])
    if (!group) return null
    const [a, b] = [groupKey(c[1], c[2]), groupKey(c[1], c[3])]
    return {
      key, label: `${group.label}: ${c[2]} vs ${c[3]}`, unit: 'yes/no', rule: { type: 'exact' },
      get: (p) => { const x = p.values[a]; const y = p.values[b]; return x && !y ? 1 : y && !x ? 0 : null },
    }
  }
  return null
}

/** Menu data: plain features, then groups with their options. */
export const PLAIN_MENU = Object.keys(FEATURES)
export const groupMenu = () => GROUPS.map((g) => ({ id: g.id, label: g.label, options: groupOptions(g) }))
export { compareKey, groupKey }
