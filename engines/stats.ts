export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Linear-interpolated quantile, q in [0,1]. */
export function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b)
  const pos = (s.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

/** Remove values outside [Q1 - k*IQR, Q3 + k*IQR]. */
export function trimIQR(xs: number[], k = 1.5): number[] {
  if (xs.length < 4) return xs
  const q1 = quantile(xs, 0.25)
  const q3 = quantile(xs, 0.75)
  const iqr = q3 - q1
  return xs.filter((x) => x >= q1 - k * iqr && x <= q3 + k * iqr)
}

export const meanAbs = (xs: number[]) => (xs.length ? mean(xs.map(Math.abs)) : 0)

/** Ordinary least squares of y on x. */
export function ols(x: number[], y: number[]) {
  const mx = mean(x)
  const my = mean(y)
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = 0; i < x.length; i++) {
    sxx += (x[i] - mx) ** 2
    sxy += (x[i] - mx) * (y[i] - my)
    syy += (y[i] - my) ** 2
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  const intercept = my - slope * mx
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy)
  return { slope, intercept, r2 }
}

/** Theil-Sen: median of all pairwise slopes. Pairs with equal x are skipped. */
export function theilSen(x: number[], y: number[]) {
  const slopes: number[] = []
  for (let i = 0; i < x.length; i++) {
    for (let j = i + 1; j < x.length; j++) {
      if (x[i] !== x[j]) slopes.push((y[j] - y[i]) / (x[j] - x[i]))
    }
  }
  if (!slopes.length) return null
  const slope = median(slopes)
  const intercept = median(y.map((yi, i) => yi - slope * x[i]))
  return { slope, intercept, pairs: slopes.length }
}

/**
 * Robust OLS: the same algebraic slope as OLS but centered on medians instead of means.
 * slope = sum((x - med(x)) * (y - med(y))) / sum((x - med(x))^2)
 */
export function robustOls(x: number[], y: number[]) {
  const mx = median(x)
  const my = median(y)
  let sxx = 0
  let sxy = 0
  for (let i = 0; i < x.length; i++) {
    sxx += (x[i] - mx) ** 2
    sxy += (x[i] - mx) * (y[i] - my)
  }
  if (sxx === 0) return null
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx }
}

/**
 * Least absolute deviation: among all lines through two data points, the one with the smallest
 * sum of absolute residuals. Above maxCandidates points, candidate lines come from a deterministic
 * subsample (every k-th point) while residuals are still summed over all points.
 */
export function lad(x: number[], y: number[], maxCandidates = 400) {
  const n = x.length
  const step = Math.max(1, Math.ceil(n / maxCandidates))
  const idx: number[] = []
  for (let i = 0; i < n; i += step) idx.push(i)
  let best: { slope: number; intercept: number; sum: number } | null = null
  for (let a = 0; a < idx.length; a++) {
    for (let b = a + 1; b < idx.length; b++) {
      const i = idx[a]
      const j = idx[b]
      if (x[i] === x[j]) continue
      const slope = (y[j] - y[i]) / (x[j] - x[i])
      const intercept = y[i] - slope * x[i]
      let sum = 0
      for (let k = 0; k < n; k++) {
        sum += Math.abs(y[k] - (slope * x[k] + intercept))
        if (best && sum >= best.sum) break
      }
      if (!best || sum < best.sum) best = { slope, intercept, sum }
    }
  }
  return best
}
