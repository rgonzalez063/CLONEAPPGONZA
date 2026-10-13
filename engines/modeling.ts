import type { FeatureDef, Property } from './types'

/**
 * Modeling: adjust every sale price to the subject using already-decided adjustments.
 * price' = price + (subject - property) * rate, for each decided feature.
 */
export function modelPrices(
  props: Property[],
  decided: { feature: FeatureDef; rate: number }[],
  subject: Record<string, number | null>,
): Property[] {
  return props.map((p) => {
    let price = p.price
    for (const { feature, rate } of decided) {
      const pv = feature.get(p)
      const sv = subject[feature.key]
      if (pv === null || sv === null || sv === undefined) continue
      price += (sv - pv) * rate
    }
    return { ...p, price }
  })
}

/** Shift prices to the effective date using a linear trend: dollars per day. */
export function timeAdjustLinear(
  props: Property[], dateOf: (p: Property) => number, effectiveDay: number, dollarsPerDay: number,
): Property[] {
  return props.map((p) => ({ ...p, price: p.price + (effectiveDay - dateOf(p)) * dollarsPerDay }))
}
