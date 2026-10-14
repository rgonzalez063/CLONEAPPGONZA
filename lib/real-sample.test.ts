import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { lad, ols, regression, robustOls, sensitivity, theilSen } from '../engines'
import { FEATURES } from './features'
import { importCsv } from './importer'
import { applyTransactional, defaultTransactional } from './transactional'

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
  it('prints the remaining Synapse comparisons for review', () => {
    const p2 = toProps(t2!)
    console.log('DS2 GLA', JSON.stringify(regression(p2, FEATURES.gla).map((r) => [r.method, Math.round(r.value ?? NaN)])))
    const lot1 = regression(toProps(t1!), FEATURES.lot_size).map((r) => [r.method, r.value && +r.value.toFixed(2)])
    console.log('DS1 LOT', JSON.stringify(lot1))
  })
})
