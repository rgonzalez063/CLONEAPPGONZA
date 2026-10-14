// Pure types for the calculation engines. No I/O, no framework imports.

export type MatchRule =
  | { type: 'exact' }
  | { type: 'pct'; pct: number } // within pct percent of each other
  | { type: 'abs'; tol: number } // within tol units of each other (e.g. 100 sqft)
  | { type: 'identicalOrBothGreater'; n: number } // equal, or both strictly greater than n

export interface FeatureDef {
  key: string
  label: string
  unit: string // 'sqft' | 'each' | 'yes/no' | ...
  get: (p: Property) => number | null // boolean features return 0/1
  rule: MatchRule // how "same" is decided in paired sales
}

export interface Property {
  id: string
  price: number // sale price after transactional and time adjustments
  values: Record<string, number | null> // feature key -> numeric value
}

export type Status = 'ok' | 'no_result' | 'excluded'

export interface MethodResult {
  method: 'GD' | 'TPS' | 'SENS' | 'OLS' | 'ROLS' | 'TS' | 'LAD'
  variant: string // 'avg' | 'median' | ''
  value: number | null
  mae: number | null
  status: Status
  reason?: string
  detail?: Record<string, number | string>
}
