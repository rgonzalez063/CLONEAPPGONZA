// Depreciated cost: what it would cost to build, less the wear it has. The adjustment for a feature is the
// difference in depreciated cost between two sizes (or two conditions). No cost data ships with the app:
// the appraiser supplies the cost per square foot.

/** Typical physical life (years) by UAD quality rating. */
export const QUALITY_LIFESPAN: Record<string, number> = {
  'Q1+': 70, Q1: 70, 'Q2+': 70, Q2: 70, 'Q3+': 70, Q3: 70, 'Q4+': 60, Q4: 60, 'Q5+': 60, Q5: 60, 'Q6+': 55, Q6: 55,
}
export const QUALITIES = Object.keys(QUALITY_LIFESPAN)

/** Effective age (years) that stands for each UAD condition rating. */
export const CONDITION_AGE: Record<string, number> = {
  C1: 0, 'C2+': 1, C2: 4, 'C3+': 8, C3: 14, 'C4+': 21, C4: 30, 'C5+': 40, C5: 55, C6: 65,
}
export const CONDITIONS = Object.keys(CONDITION_AGE)

/** Share of cost that is left after wear: 1 - effective age / life, never below zero. */
export const remaining = (effectiveAge: number, lifespan: number) => Math.max(0, 1 - effectiveAge / lifespan)

export interface SizeCostInput {
  subjectSize: number // sqft
  costPerSqft: number // at the subject's size
  costChangePerStep?: number // change in cost per sqft for each step up in size (usually negative: bigger is cheaper per foot)
  kitchenPct?: number // share of cost that is the kitchen, taken out because the kitchen is adjusted separately (percent)
  effectiveAge: number
  lifespan: number
  stepPct?: number // how far each step moves the size (default 15)
}
export interface SizeStep { size: number; costPerSqft: number; cost: number; kitchen: number; costNoKitchen: number; depreciation: number; depreciated: number }
export interface SizeCostResult { value: number; steps: SizeStep[]; rates: number[] }

/**
 * Three sizes (smaller, the subject's, larger) are priced, worn down, and compared. The result is the average of the
 * two per-square-foot differences between neighbouring sizes.
 */
export function depreciatedCostBySize(i: SizeCostInput): SizeCostResult | null {
  const pct = (i.stepPct ?? 15) / 100
  if (!(i.subjectSize > 0) || !(i.costPerSqft > 0) || !(i.lifespan > 0)) return null
  const change = i.costChangePerStep ?? 0
  const sizes = [Math.round(i.subjectSize * (1 - pct)), i.subjectSize, Math.round(i.subjectSize * (1 + pct))]
  const steps = sizes.map((size, k): SizeStep => {
    const costPerSqft = i.costPerSqft + change * (k - 1)
    const cost = Math.round(costPerSqft * size)
    const kitchen = Math.round(cost * ((i.kitchenPct ?? 0) / 100))
    const costNoKitchen = cost - kitchen
    const depreciation = costNoKitchen * (1 - remaining(i.effectiveAge, i.lifespan))
    return { size, costPerSqft, cost, kitchen, costNoKitchen, depreciation, depreciated: costNoKitchen - depreciation }
  })
  const rates = [0, 1].map((k) => (steps[k + 1].depreciated - steps[k].depreciated) / (steps[k + 1].size - steps[k].size))
  return { value: (rates[0] + rates[1]) / 2, steps, rates }
}

export interface ConditionRow { condition: string; effectiveAge: number; remaining: number; depreciated: number }
/** Depreciated cost of the whole house at every UAD condition, and the value of each full step between them. */
export function depreciatedCostByCondition(costPerSqft: number, gla: number, lifespan: number, additionalDepreciation = 0) {
  if (!(costPerSqft > 0) || !(gla > 0) || !(lifespan > 0)) return null
  const cost = Math.round(costPerSqft * gla)
  const rows: ConditionRow[] = CONDITIONS.map((c) => {
    const rem = Math.round(remaining(CONDITION_AGE[c], lifespan) * 10000) / 10000 // Synapse applies the percentage rounded to two decimals
    return { condition: c, effectiveAge: CONDITION_AGE[c], remaining: rem, depreciated: Math.round(cost * rem - additionalDepreciation) }
  })
  // A full step is one whole letter grade: C1 to C2, C2+ to C3+, C2 to C3, and so on.
  const steps = [['C1', 'C2'], ['C2+', 'C3+'], ['C2', 'C3'], ['C3+', 'C4+'], ['C3', 'C4'], ['C4+', 'C5+'], ['C4', 'C5'], ['C5+', 'C6'], ['C5', 'C6']]
    .map(([hi, lo]) => ({ from: hi, to: lo, value: rows.find((r) => r.condition === hi)!.depreciated - rows.find((r) => r.condition === lo)!.depreciated }))
  return { cost, rows, steps }
}
