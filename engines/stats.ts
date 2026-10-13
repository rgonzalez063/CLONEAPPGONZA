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
