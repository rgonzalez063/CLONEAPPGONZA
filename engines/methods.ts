import { lad, mean, median, meanAbs, medianSquares, modifiedQuantile, ols, quantile, robustOls, theilSen, trimIQR } from './stats'
import type { FeatureDef, MatchRule, MethodResult, Property } from './types'

const val = (p: Property, f: FeatureDef) => f.get(p)

function same(a: number, b: number, rule: MatchRule): boolean {
  switch (rule.type) {
    case 'exact':
      return a === b
    case 'pct': {
      const base = Math.max(Math.abs(a), Math.abs(b))
      return base === 0 ? true : Math.abs(a - b) / base <= rule.pct / 100
    }
    case 'abs':
      return Math.abs(a - b) <= rule.tol
    case 'identicalOrBothGreater':
      return a === b || (a > rule.n && b > rule.n)
  }
}

/** Properties that have both a price and the studied feature. */
function usable(props: Property[], f: FeatureDef) {
  return props.filter((p) => val(p, f) !== null && Number.isFinite(p.price))
}

const noResult = (method: MethodResult['method'], variant: string, reason: string): MethodResult => ({
  method, variant, value: null, mae: null, status: 'no_result', reason,
})

// ------------------------------------------------------------------ paired sales

export interface Pair { a: string; b: string; priceDiff: number; featureDiff: number; rate: number }

/**
 * True paired sales: two properties match on every OTHER feature (within rules)
 * and differ on the studied feature. Rate = price difference / feature difference.
 */
export function findPairs(props: Property[], studied: FeatureDef, all: FeatureDef[]): Pair[] {
  const others = all.filter((f) => f.key !== studied.key)
  const list = usable(props, studied)
  // Bucket by exact-match features to avoid comparing everything with everything.
  const exactKeys = others.filter((f) => f.rule.type === 'exact')
  const buckets = new Map<string, Property[]>()
  for (const p of list) {
    const key = exactKeys.map((f) => String(val(p, f))).join('|')
    const arr = buckets.get(key)
    if (arr) arr.push(p)
    else buckets.set(key, [p])
  }
  const rest = others.filter((f) => f.rule.type !== 'exact')
  const pairs: Pair[] = []
  for (const group of buckets.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const p = group[i]
        const q = group[j]
        const sp = val(p, studied)!
        const sq = val(q, studied)!
        if (same(sp, sq, studied.rule)) continue // studied feature must differ
        let ok = true
        for (const f of rest) {
          const a = val(p, f)
          const b = val(q, f)
          if (a === null || b === null) { ok = false; break }
          if (!same(a, b, f.rule)) { ok = false; break }
        }
        if (!ok) continue
        const [lo, hi] = sp < sq ? [p, q] : [q, p]
        const featureDiff = val(hi, studied)! - val(lo, studied)!
        const priceDiff = hi.price - lo.price
        pairs.push({ a: lo.id, b: hi.id, priceDiff, featureDiff, rate: priceDiff / featureDiff })
      }
    }
  }
  return pairs
}

export function pairedSales(
  props: Property[], studied: FeatureDef, all: FeatureDef[], opts: { removeOutliers?: boolean } = {},
): MethodResult[] {
  const pairs = findPairs(props, studied, all)
  if (!pairs.length) return ['avg', 'median'].map((v) => noResult('TPS', v, 'no matched pairs'))
  let rates = pairs.map((p) => p.rate)
  if (opts.removeOutliers) rates = trimIQR(rates, 1.5)
  const results: MethodResult[] = []
  for (const [variant, value] of [['avg', mean(rates)], ['median', median(rates)]] as const) {
    results.push({
      method: 'TPS', variant, value,
      mae: meanAbs(rates.map((r) => r - value)),
      status: 'ok',
      detail: { pairs: rates.length, pairsBeforeTrim: pairs.length },
    })
  }
  return results
}

// ------------------------------------------------------------------ allocation

/**
 * Allocation: the appraiser says what share of the price belongs to the feature (35% of the price to GLA, say). Each sale's
 * share divided by its amount of the feature is a rate; the average and the median of those rates are the results.
 */
export function allocation(props: Property[], studied: FeatureDef, pct: number): MethodResult[] {
  const rates = usable(props, studied).filter((p) => val(p, studied)! > 0).map((p) => (p.price * (pct / 100)) / val(p, studied)!)
  if (rates.length < 2) return ['avg', 'median'].map((v) => noResult('ALLOC', v, 'not enough sales with the feature'))
  return ([['avg', mean(rates)], ['median', median(rates)]] as const).map(([variant, value]) => ({
    method: 'ALLOC' as const, variant, value, mae: meanAbs(rates.map((r) => r - value)), status: 'ok' as const, detail: { pct, n: rates.length },
  }))
}

// ------------------------------------------------------------------ grouped data

export interface Group { from: number; to: number } // inclusive range of the studied feature

export function groupedData(
  props: Property[], studied: FeatureDef, g1: Group, g2: Group, stat: 'avg' | 'median', minPerGroup = 2,
): MethodResult {
  const list = usable(props, studied)
  const in1 = list.filter((p) => val(p, studied)! >= g1.from && val(p, studied)! <= g1.to)
  const in2 = list.filter((p) => val(p, studied)! >= g2.from && val(p, studied)! <= g2.to)
  if (in1.length < minPerGroup || in2.length < minPerGroup) {
    return noResult('GD', stat, `not enough properties (minimum ${minPerGroup} per group)`)
  }
  const agg = stat === 'avg' ? mean : median
  const p1 = agg(in1.map((p) => p.price))
  const p2 = agg(in2.map((p) => p.price))
  const f1 = agg(in1.map((p) => val(p, studied)!))
  const f2 = agg(in2.map((p) => val(p, studied)!))
  if (f1 === f2) return noResult('GD', stat, 'groups have the same feature value')
  const rate = (p2 - p1) / (f2 - f1)
  const resid = [...in1, ...in2].map((p) => p.price - (p1 + rate * (val(p, studied)! - f1)))
  return {
    method: 'GD', variant: stat, value: rate, mae: meanAbs(resid), status: 'ok',
    detail: { n1: in1.length, n2: in2.length, price1: p1, price2: p2, feature1: f1, feature2: f2 },
  }
}

// ------------------------------------------------------------------ sensitivity

/**
 * Plug in each candidate adjustment, adjust every price to the subject, and pick the
 * candidate with the smallest range of adjusted prices after trimming trimPct from each end.
 */
export function sensitivity(
  props: Property[], studied: FeatureDef, subjectValue: number,
  opts: { min: number; max: number; step: number; trimPct?: number; fineStep?: number },
): MethodResult {
  const list = usable(props, studied)
  if (list.length < 3) return noResult('SENS', '', 'not enough properties')
  if (new Set(list.map((p) => val(p, studied))).size === 1) return noResult('SENS', '', 'all properties have the same value')
  const trim = (opts.trimPct ?? 3) / 100
  const rangeAt = (a: number) => {
    const adj = list.map((p) => p.price + (subjectValue - val(p, studied)!) * a)
    return { adj, range: quantile(adj, 1 - trim) - quantile(adj, trim) }
  }
  let bestA = NaN
  let bestRange = Infinity
  const scan = (from: number, to: number, step: number) => {
    const steps = Math.max(1, Math.round((to - from) / step))
    for (let i = 0; i <= steps; i++) {
      const a = from + i * step
      const { range } = rangeAt(a)
      if (range < bestRange - 1e-9) { bestRange = range; bestA = a }
    }
  }
  // Coarse pass over the whole range, then ever finer passes around the best rate until the final step.
  let step = opts.step
  scan(opts.min, opts.max, step)
  const fine = opts.fineStep ?? step
  while (step > fine * 1.0000001) {
    const center = bestA
    step = Math.max(fine, step / 10)
    scan(center - step * 10, center + step * 10, step)
  }
  bestA = Math.round(bestA / fine) * fine
  const { adj, range } = rangeAt(bestA)
  const m = mean(adj) // error is measured over every sale, not just the ones inside the trim
  return { method: 'SENS', variant: '', value: bestA, mae: meanAbs(adj.map((x) => x - m)), status: 'ok', detail: { range } }
}

// ------------------------------------------------------------------ regression

export function regression(props: Property[], studied: FeatureDef): MethodResult[] {
  const list = usable(props, studied)
  const x = list.map((p) => val(p, studied)!)
  const y = list.map((p) => p.price)
  const out: MethodResult[] = []
  const o = list.length >= 3 ? ols(x, y) : null
  if (o) {
    out.push({
      method: 'OLS', variant: '', value: o.slope,
      mae: meanAbs(y.map((yi, i) => yi - (o.intercept + o.slope * x[i]))), status: 'ok',
      detail: { r2: o.r2, intercept: o.intercept, n: list.length },
    })
  } else out.push(noResult('OLS', '', 'not enough variation'))
  const t = list.length >= 3 ? theilSen(x, y) : null
  if (t) {
    out.push({
      method: 'TS', variant: '', value: t.slope,
      mae: meanAbs(y.map((yi, i) => yi - (t.intercept + t.slope * x[i]))), status: 'ok',
      detail: { intercept: t.intercept, n: list.length },
    })
  } else out.push(noResult('TS', '', 'not enough variation'))
  const r = list.length >= 3 ? robustOls(x, y) : null
  if (r) {
    out.push({
      method: 'ROLS', variant: '', value: r.slope,
      mae: meanAbs(y.map((yi, i) => yi - (r.intercept + r.slope * x[i]))), status: 'ok', detail: { intercept: r.intercept, n: list.length },
    })
  } else out.push(noResult('ROLS', '', 'not enough variation'))
  const l = list.length >= 3 ? lad(x, y) : null
  if (l) {
    out.push({
      method: 'LAD', variant: '', value: l.slope,
      mae: l.sum / list.length, status: 'ok', detail: { intercept: l.intercept, n: list.length },
    })
  } else out.push(noResult('LAD', '', 'not enough variation'))
  const line = (method: 'LMS' | 'RLMS', fit: { slope: number; intercept: number } | null): MethodResult =>
    fit ? {
      method, variant: '', value: fit.slope, mae: meanAbs(y.map((yi, i) => yi - (fit.intercept + fit.slope * x[i]))), status: 'ok',
      detail: { intercept: fit.intercept, n: list.length },
    } : noResult(method, '', 'invalid response: most sales share the same value')
  out.push(line('LMS', list.length >= 3 ? medianSquares(x, y, 'mean') : null))
  out.push(line('RLMS', list.length >= 3 ? medianSquares(x, y, 'median') : null))
  const q = list.length >= 3 ? modifiedQuantile(x, y) : null
  if (q) {
    out.push({
      method: 'MODQ', variant: '', value: q.slope, mae: meanAbs(y.map((yi, i) => yi - (q.intercept + q.slope * x[i]))), status: 'ok',
      detail: { intercept: q.intercept, r2: q.r2, percentile: q.percentile, n: list.length },
    })
  } else out.push(noResult('MODQ', '', 'not enough variation'))
  return out
}
