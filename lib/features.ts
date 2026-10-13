import type { FeatureDef } from '@/engines'

const num = (k: string) => (p: { values: Record<string, number | null> }) => p.values[k] ?? null

/** Features known to the thin slice. Match rules are defaults the user can change later. */
export const FEATURES: Record<string, FeatureDef> = {
  gla: { key: 'gla', label: 'GLA', unit: 'sqft', get: num('gla'), rule: { type: 'pct', pct: 5 } },
  lot_size: { key: 'lot_size', label: 'Lot Size', unit: 'sqft', get: num('lot_size'), rule: { type: 'pct', pct: 5 } },
  baths_full: { key: 'baths_full', label: 'Full Bath', unit: 'each', get: num('baths_full'), rule: { type: 'exact' } },
  garage: { key: 'garage', label: 'Garage Spaces', unit: 'each', get: num('garage'), rule: { type: 'exact' } },
  stories: { key: 'stories', label: 'Stories', unit: 'each', get: num('stories'), rule: { type: 'exact' } },
  beds: { key: 'beds', label: 'Bedrooms', unit: 'each', get: num('beds'), rule: { type: 'identicalOrBothGreater', n: 3 } },
}
export const FEATURE_ORDER = ['lot_size', 'gla', 'baths_full', 'garage']
export const ALL_FEATURES = Object.values(FEATURES)
