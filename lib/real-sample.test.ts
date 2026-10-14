import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findPairs, lad, medianSquares, modifiedQuantile, ols, pairedSales, regression, robustOls, sensitivity, theilSen } from '../engines'
import { ALL_FEATURES, FEATURES, resolveFeature } from './features'
import { importCsv } from './importer'
import { applyTransactional, defaultTransactional } from './transactional'
import { defaultPairedSettings, matchFeatures, studiedWithRule, type PairedSettings } from './pairedSettings'

// Acceptance test against the user's real HARMLS exports and the numbers Synapse produced for them.
// The exports are private and gitignored (.sample/). The test is skipped when they are absent.
const dir = path.resolve(__dirname, '../.sample')
const have = fs.existsSync(path.join(dir, 'COMPS_REPORT.csv')) && fs.existsSync(path.join(dir, 'NEIGH.csv'))
const EFFECTIVE = '2026-10-09'

describe.skipIf(!have)('real HARMLS sample session (subject effective 2026-10-09)', () => {
  const load = (f: string) => importCsv(fs.readFileSync(path.join(dir, f), 'utf8'), EFFECTIVE)
  const d1raw = have ? load('COMPS_REPORT.csv') : null
  const d2raw = have ? load('NEIGH.csv') : null
  const t1 = have ? applyTransactional(d1raw!.properties, defaultTransactional, EFFECTIVE) : null
  const t2 = have ? applyTransactional(d2raw!.properties, defaultTransactional, EFFECTIVE) : null
  const toProps = (r: NonNullable<typeof t1>) => r.properties.map((p) => ({ id: p.id, price: p.adjPrice, values: p.values }))

  it('imports both files with no missing fields', () => {
    expect(d1raw!.missingFields).toEqual([])
    expect(d2raw!.missingFields).toEqual([])
    expect(d1raw!.properties.length).toBe(6)
  })
  it('dataset 2 drops the one seller-financed sale (Synapse showed 209)', () => {
    expect(t2!.properties.length).toBe(209)
  })
  it('dataset 1 time trend matches Synapse (y = 23.7517x + 231263.17)', () => {
    console.log('DS1 trend', t1!.report.timeModel, t1!.report.trend?.coefficients, 'r2', t1!.report.trend?.r2, 'oldest', t1!.report.oldestDate)
    console.log('DS2 trend', t2!.report.timeModel, t2!.report.trend?.coefficients, 'r2', t2!.report.trend?.r2, 'oldest', t2!.report.oldestDate)
    expect(t1!.report.timeModel).toBe('linear')
    expect(t1!.report.trend!.coefficients[0]).toBeCloseTo(23.7517, 2)
    expect(t1!.report.trend!.coefficients[1]).toBeCloseTo(231263.17, 0)
  })
  it('dataset 1 GLA regression matches Synapse (OLS $43, intercept 171,745, r2 0.724)', () => {
    const props = toProps(t1!)
    const x = props.map((p) => p.values.gla as number)
    const y = props.map((p) => p.price)
    const o = ols(x, y)!
    console.log('DS1 GLA OLS', o, 'TS', theilSen(x, y))
    expect(o.slope).toBeCloseTo(43, 0)
    expect(o.intercept).toBeCloseTo(171745, -2)
    expect(o.r2).toBeCloseTo(0.724, 2)
  })
  it('dataset 1 GLA sensitivity (trim 5%) matches Synapse ($39)', () => {
    const r = sensitivity(toProps(t1!), FEATURES.gla, 1500, { min: 0, max: 200, step: 1, trimPct: 5 })
    console.log('DS1 GLA SENS', r.value, r.mae)
    expect(Math.round(r.value!)).toBe(39)
  })
  it('dataset 1 matches Synapse for OLS, Theil-Sen, robust OLS and LAD on lot size, baths and garage', () => {
    // Expected values are the numbers in the Synapse adjustment support document for this session.
    const props = toProps(t1!)
    const expected: Record<string, { ols: number; ts: number; rols: number; lad: number; tol: number }> = {
      gla: { ols: 43, ts: 41, rols: 42, lad: 35, tol: 0.5 },
      lot_size: { ols: -0.4, ts: 2.38, rols: -0.46, lad: -2.6, tol: 0.006 },
      baths_full: { ols: 12948, ts: 14116, rols: 10268, lad: 20536, tol: 0.6 },
      garage: { ols: 3353, ts: 7812, rols: 3542, lad: 3837, tol: 0.6 },
    }
    for (const [k, e] of Object.entries(expected)) {
      const pts = props.filter((p) => p.values[k] !== null)
      const x = pts.map((p) => p.values[k] as number)
      const y = pts.map((p) => p.price)
      expect(Math.abs(ols(x, y)!.slope - e.ols), `${k} OLS`).toBeLessThanOrEqual(e.tol)
      expect(Math.abs(theilSen(x, y)!.slope - e.ts), `${k} TS`).toBeLessThanOrEqual(e.tol)
      expect(Math.abs(robustOls(x, y)!.slope - e.rols), `${k} ROLS`).toBeLessThanOrEqual(e.tol)
      expect(Math.abs(lad(x, y)!.slope - e.lad), `${k} LAD`).toBeLessThanOrEqual(e.tol)
    }
  })
  it('dataset 1 matches Synapse for least median of squares, robust LMS and modified quantile (slope and intercept)', () => {
    const props = toProps(t1!)
    // [LMS slope, LMS intercept, RLMS slope, RLMS intercept, ModQ slope, ModQ intercept] from the Synapse documents; null = "Invalid Response".
    const expected: Record<string, [number, number, number | null, number | null, number, number]> = {
      gla: [50, 161868, 42, 171381, 43, 172539],
      lot_size: [3.53, 214695, 3.87, 209898, -0.52, 239748],
      baths_full: [9444, 214763, null, null, 10268, 214625],
      garage: [5133, 232520, 15348, 227487, 3542, 233390],
    }
    for (const [k, e] of Object.entries(expected)) {
      const pts = props.filter((p) => p.values[k] !== null)
      const x = pts.map((p) => p.values[k] as number)
      const y = pts.map((p) => p.price)
      const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-9)
      const l = medianSquares(x, y, 'mean')!
      expect(rel(l.slope, e[0]), `${k} LMS slope`).toBeLessThan(0.01)
      expect(Math.abs(l.intercept - e[1]), `${k} LMS intercept`).toBeLessThan(15)
      const r = medianSquares(x, y, 'median')
      if (e[2] === null) expect(r, `${k} RLMS invalid`).toBeNull()
      else {
        expect(rel(r!.slope, e[2]), `${k} RLMS slope`).toBeLessThan(0.01)
        expect(Math.abs(r!.intercept - e[3]!), `${k} RLMS intercept`).toBeLessThan(15)
      }
      const q = modifiedQuantile(x, y)!
      expect(rel(q.slope, e[4]), `${k} ModQ slope`).toBeLessThan(0.01)
      expect(Math.abs(q.intercept - e[5]), `${k} ModQ intercept`).toBeLessThan(15)
    }
  })
  it('dataset 2 GLA is close to Synapse for LMS ($150) and robust LMS ($170); modified quantile ($145) is not reproduced there', () => {
    const props = toProps(applyTransactional(d2raw!.properties, { ...defaultTransactional, timeModel: 'none' }, EFFECTIVE))
    const x = props.map((p) => p.values.gla as number)
    const y = props.map((p) => p.price)
    console.log('DS2 GLA LMS', medianSquares(x, y, 'mean'), 'RLMS', medianSquares(x, y, 'median'), 'ModQ', modifiedQuantile(x, y))
    expect(Math.abs(medianSquares(x, y, 'mean')!.slope - 150)).toBeLessThan(2)
    expect(Math.abs(medianSquares(x, y, 'median')!.slope - 170)).toBeLessThan(4)
    // Synapse printed 145 (the plain median-centered fit); the best-fit percentile here is the 60th ($153). Left unmatched on purpose.
  })
  it('dataset 2 GLA matches Synapse for OLS ($154) and Theil-Sen ($162) within $1 (no time trend: the report printed no trend formula for dataset 2)', () => {
    const props = toProps(applyTransactional(d2raw!.properties, { ...defaultTransactional, timeModel: 'none' }, EFFECTIVE))
    const x = props.map((p) => p.values.gla as number)
    const y = props.map((p) => p.price)
    expect(Math.abs(ols(x, y)!.slope - 154)).toBeLessThan(1)
    expect(Math.abs(theilSen(x, y)!.slope - 162)).toBeLessThan(1)
    const lad2 = lad(x, y)!.slope
    const rols2 = robustOls(x, y)!.slope
    console.log('DS2 GLA LAD', lad2, 'target 156; ROLS', rols2, 'target 145')
  })
  it('dataset 2 GLA paired sales: pair count and error close to Synapse (237 pairs, error 73/72)', () => {
    const props = toProps(applyTransactional(d2raw!.properties, { ...defaultTransactional, timeModel: 'none' }, EFFECTIVE))
    const n = findPairs(props, FEATURES.gla, ALL_FEATURES).length
    expect(n).toBeGreaterThanOrEqual(225)
    expect(n).toBeLessThanOrEqual(245)
    const res = pairedSales(props, FEATURES.gla, ALL_FEATURES, { removeOutliers: true })
    expect(Math.abs(res[0].mae! - 73)).toBeLessThan(5)
    expect(Math.abs(res[1].mae! - 72)).toBeLessThan(5)
  })
  it('feature groups count properties like Synapse (cooling: Central 184, None 6 of the dataset)', () => {
    const props = toProps(t2!)
    const central = resolveFeature('grp:cooling:Central')!
    expect(props.filter((p) => central.get(p) === 1).length).toBeGreaterThanOrEqual(180)
    expect(props.filter((p) => p.values['grp:cooling:None'] === 1).length).toBe(6)
  })
  it('prints the remaining Synapse comparisons for review', () => {
    const p2 = toProps(t2!)
    console.log('DS2 GLA', JSON.stringify(regression(p2, FEATURES.gla).map((r) => [r.method, Math.round(r.value ?? NaN)])))
    const lot1 = regression(toProps(t1!), FEATURES.lot_size).map((r) => [r.method, r.value && +r.value.toFixed(2)])
    console.log('DS1 LOT', JSON.stringify(lot1))
  })
})

describe.skipIf(!have)('paired sales settings on the real dataset 2', () => {
  const d2 = have ? importCsv(fs.readFileSync(path.join(dir, 'NEIGH.csv'), 'utf8'), EFFECTIVE) : null
  const props = have ? applyTransactional(d2!.properties, { ...defaultTransactional, timeModel: 'none' }, EFFECTIVE).properties.map((p) => ({ id: p.id, price: p.adjPrice, values: p.values })) : []
  const count = (s: PairedSettings) => findPairs(props, studiedWithRule(FEATURES.gla, s), matchFeatures(s)).length
  it('default settings find about as many pairs as Synapse (237)', () => {
    expect(Math.abs(count(defaultPairedSettings()) - 237)).toBeLessThan(10)
  })
  it('a looser lot size rule finds more pairs, a stricter one fewer', () => {
    const at = (pct: number) => { const s = defaultPairedSettings(); s.features.lot_size.rule = { type: 'pct', pct }; return count(s) }
    expect(at(10)).toBeGreaterThan(at(5))
    expect(at(1)).toBeLessThan(at(5))
  })
  it('switching a feature off finds more pairs; switching carport on finds fewer', () => {
    const base = count(defaultPairedSettings())
    const off = defaultPairedSettings(); off.features.beds.enabled = false
    const on = defaultPairedSettings(); on.features.carport.enabled = true
    expect(count(off)).toBeGreaterThan(base)
    expect(count(on)).toBeLessThanOrEqual(base)
  })
  it('a size tolerance in square feet works for the studied feature too', () => {
    const s = defaultPairedSettings(); s.features.gla.rule = { type: 'abs', tol: 100 }
    expect(count(s)).toBeLessThan(count(defaultPairedSettings()) + 1)
  })
})
