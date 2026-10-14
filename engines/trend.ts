import { mean } from './stats'

export type TrendModel = 'linear' | 'log' | 'poly2' | 'poly3' | 'poly4'

export interface Trend {
  model: TrendModel
  coefficients: number[] // for poly: highest power first; linear: [a, b] for y = a*x + b; log: [a, b] for y = a*ln(x) + b
  r2: number
  predict: (x: number) => number
}

/** Solve A x = b by Gaussian elimination with partial pivoting. Returns null if singular. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    if (Math.abs(M[p][c]) < 1e-12) return null
    ;[M[c], M[p]] = [M[p], M[c]]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let s = M[i][n]
    for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k]
    x[i] = s / M[i][i]
  }
  return x
}

/** Least-squares polynomial fit of the given degree. x is centered and scaled for stability. */
function polyFit(xs: number[], ys: number[], degree: number): { predict: (x: number) => number; coefficients: number[] } | null {
  const mx = mean(xs)
  const sx = Math.max(1e-9, Math.sqrt(mean(xs.map((v) => (v - mx) ** 2))))
  const z = xs.map((v) => (v - mx) / sx)
  const m = degree + 1
  const A = Array.from({ length: m }, () => new Array(m).fill(0))
  const b = new Array(m).fill(0)
  for (let i = 0; i < z.length; i++) {
    for (let r = 0; r < m; r++) {
      b[r] += ys[i] * z[i] ** r
      for (let c = 0; c < m; c++) A[r][c] += z[i] ** (r + c)
    }
  }
  const coef = solve(A, b)
  if (!coef) return null
  // Expand sum(c_p * ((x - mx) / sx)^p) into plain powers of x, highest power first, as the report prints them.
  const binom = (n: number, k: number) => { let r = 1; for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i; return r }
  const plain = new Array(m).fill(0) // plain[k] multiplies x^k
  coef.forEach((c, p) => { for (let k = 0; k <= p; k++) plain[k] += (c * binom(p, k) * (-mx) ** (p - k)) / sx ** p })
  return {
    predict: (x) => { const zz = (x - mx) / sx; return coef.reduce((acc, c, p) => acc + c * zz ** p, 0) },
    coefficients: plain.reverse(),
  }
}

const rSquared = (ys: number[], pred: number[]) => {
  const my = mean(ys)
  const ssTot = ys.reduce((a, y) => a + (y - my) ** 2, 0)
  const ssRes = ys.reduce((a, y, i) => a + (y - pred[i]) ** 2, 0)
  return ssTot === 0 ? 1 : 1 - ssRes / ssTot
}

/** Minimum sales needed: 10 per inflection point (poly degree d has d-1). Linear and log need 3. */
export const minPoints = (m: TrendModel) => (m === 'linear' || m === 'log' ? 3 : 10 * (Number(m.slice(4)) - 1))

export function fitTrend(xs: number[], ys: number[], model: TrendModel): Trend | null {
  if (xs.length < minPoints(model)) return null
  if (model === 'linear') {
    const mx = mean(xs)
    const my = mean(ys)
    let sxx = 0
    let sxy = 0
    for (let i = 0; i < xs.length; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my) }
    if (sxx === 0) return null
    const a = sxy / sxx
    const b = my - a * mx
    const predict = (x: number) => a * x + b
    return { model, coefficients: [a, b], r2: rSquared(ys, xs.map(predict)), predict }
  }
  if (model === 'log') {
    // ln(x) is undefined at x = 0, and the oldest sale always sits at x = 0, so this model
    // is unavailable unless the caller supplies a positive offset (days since oldest + 1).
    if (xs.some((x) => x <= 0)) return null
    const lx = xs.map((x) => Math.log(x))
    const lin = fitTrend(lx, ys, 'linear')
    if (!lin) return null
    const predict = (x: number) => lin.predict(Math.log(x))
    return { model, coefficients: lin.coefficients, r2: rSquared(ys, xs.map(predict)), predict }
  }
  const degree = Number(model.slice(4))
  const f = polyFit(xs, ys, degree)
  if (!f) return null
  return { model, coefficients: f.coefficients, r2: rSquared(ys, xs.map(f.predict)), predict: f.predict }
}

/** Best-fitting allowed trend by r-squared. Higher-order models only qualify with enough sales. */
export function bestTrend(xs: number[], ys: number[], allowed: TrendModel[] = ['linear', 'log', 'poly2', 'poly3', 'poly4']): Trend | null {
  let best: Trend | null = null
  for (const m of allowed) {
    const t = fitTrend(xs, ys, m)
    if (t && (!best || t.r2 > best.r2 + 1e-12)) best = t
  }
  return best
}
