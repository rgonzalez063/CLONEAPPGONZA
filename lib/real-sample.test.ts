import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { mc1004, reoStats, findPairs, groupedData, lad, median, medianSquares, modifiedQuantile, ols, pairedSales, regression, robustOls, sensitivity, theilSen } from '../engines'
import { exteriorSignature, groupAnalyses } from './analysis'
import { importMarketCsv } from './marketImport'
import { FEATURES, resolveFeature } from './features'
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
  const toProps = (r: NonNullable<typeof t1>) => r.properties.map((p) => ({ id: p.id, price: p.adjPrice, values: { ...p.values, ext_sig: exteriorSignature(p.values) } as Record<string, number | null> }))

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
  it('dataset 2 GLA paired sales with the default settings: close to Synapse (237 pairs, $85 / $98, error 73 / 72)', () => {
    const props = toProps(applyTransactional(d2raw!.properties, { ...defaultTransactional, timeModel: 'none' }, EFFECTIVE))
    const settings = defaultPairedSettings()
    const must = matchFeatures(settings)
    const studied = studiedWithRule(FEATURES.gla, settings)
    const n = findPairs(props, studied, must).length
    // Synapse also matches on views, flood zone, external influence and basement, which the export does not carry: it prunes ~30 more.
    expect(n).toBeGreaterThanOrEqual(230)
    expect(n).toBeLessThanOrEqual(275)
    const res = pairedSales(props, studied, must, { removeOutliers: true })
    expect(Math.abs(res[0].value! - 85)).toBeLessThan(3)
    expect(Math.abs(res[1].value! - 98)).toBeLessThan(3)
    expect(Math.abs(res[0].mae! - 73)).toBeLessThan(2)
    expect(Math.abs(res[1].mae! - 72)).toBeLessThan(2)
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
  const props = have ? applyTransactional(d2!.properties, { ...defaultTransactional, timeModel: 'none' }, EFFECTIVE).properties.map((p) => ({ id: p.id, price: p.adjPrice, values: { ...p.values, ext_sig: exteriorSignature(p.values) } as Record<string, number | null> })) : []
  const count = (s: PairedSettings) => findPairs(props, studiedWithRule(FEATURES.gla, s), matchFeatures(s)).length
  it('default settings find about as many pairs as Synapse (237)', () => {
    expect(Math.abs(count(defaultPairedSettings()) - 237)).toBeLessThan(40)
  })
  it('a looser lot size rule finds more pairs, a stricter one fewer', () => {
    const at = (pct: number) => { const s = defaultPairedSettings(); s.features.lot_size.rule = { type: 'pct', pct }; return count(s) }
    expect(at(10)).toBeGreaterThan(at(5))
    expect(at(1)).toBeLessThan(at(5))
  })
  it('switching a feature off finds more pairs; switching style on finds fewer', () => {
    const base = count(defaultPairedSettings())
    const off = defaultPairedSettings(); off.features.beds.enabled = false
    const on = defaultPairedSettings(); on.features.style_code.enabled = true
    expect(count(off)).toBeGreaterThan(base)
    expect(count(on)).toBeLessThanOrEqual(base)
  })
  it('a size tolerance in square feet works for the studied feature too', () => {
    const s = defaultPairedSettings(); s.features.gla.rule = { type: 'abs', tol: 100 }
    expect(count(s)).toBeLessThan(count(defaultPairedSettings()) + 1)
  })
})

// A second real session (22531 John Rolfe Ln): dataset 1 has 4 sales, dataset 2 has 42 of which Synapse used 41.
const jdir = path.resolve(__dirname, '../.sample/john')
const haveJ = fs.existsSync(path.join(jdir, 'comps.csv')) && fs.existsSync(path.join(jdir, 'neigh.csv'))
describe.skipIf(!haveJ)('real John Rolfe Ln session (effective 2026-10-09)', () => {
  const load = (f: string) => importCsv(fs.readFileSync(path.join(jdir, f), 'utf8'), EFFECTIVE)
  const r1 = haveJ ? applyTransactional(load('comps.csv').properties, defaultTransactional, EFFECTIVE) : null
  const r2 = haveJ ? applyTransactional(load('neigh.csv').properties, defaultTransactional, EFFECTIVE) : null
  const prep = (r: NonNullable<typeof r1>) => r.properties.map((p) => ({ id: p.id, price: p.adjPrice, values: { ...p.values, ext_sig: exteriorSignature(p.values) } as Record<string, number | null> }))
  const gla = (props: ReturnType<typeof prep>) => ({ x: props.map((p) => p.values.gla as number), y: props.map((p) => p.price) })

  it('time trends match: dataset 1 linear, dataset 2 a 4th-degree polynomial, to nine digits', () => {
    expect(r1!.report.timeModel).toBe('linear')
    expect(r1!.report.trend!.coefficients[0]).toBeCloseTo(643.9366892776, 6)
    expect(r1!.report.trend!.coefficients[1]).toBeCloseTo(252407.295013687, 3)
    expect(r2!.report.timeModel).toBe('poly4')
    const c = r2!.report.trend!.coefficients
    expect(c[0]).toBeCloseTo(0.0000636214, 9)
    expect(c[1]).toBeCloseTo(-0.0535661102, 7)
    expect(c[2]).toBeCloseTo(14.004464134, 5)
    expect(c[3]).toBeCloseTo(-1017.9491191489, 2)
    expect(c[4]).toBeCloseTo(237785.8073189052, 1)
    expect(r1!.report.oldestDate).toBe('2026-04-11')
    expect(r2!.report.oldestDate).toBe('2025-10-07')
  })
  it('dataset 2 drops the one REO sale (41 left, as Synapse used)', () => { expect(r2!.properties.length).toBe(41); expect(r2!.report.removed.reo).toBe(1) })
  it('GLA regression methods match Synapse on both datasets', () => {
    // [method, slope, intercept] as printed in the GLA details page.
    const want: Record<string, Record<string, [number, number]>> = {
      d1: { OLS: [30, 319362], ROLS: [32, 315146], TS: [14, 345975], LAD: [47, 291815], LMS: [16, 343032], RLMS: [2, 362021], MODQ: [32, 315146] },
      d2: { OLS: [67, 145844], ROLS: [64, 154172], TS: [59, 157959], LAD: [59, 160998], LMS: [90, 106427], RLMS: [36, 198042], MODQ: [67, 145886] },
    }
    for (const [name, r] of [['d1', r1!], ['d2', r2!]] as const) {
      const { x, y } = gla(prep(r))
      const got = regression(prep(r).map((p) => ({ id: p.id, price: p.price, values: p.values })), FEATURES.gla)
      for (const m of got) {
        const w = want[name][m.method]
        if (!w) continue
        const tol = m.method === 'TS' ? 2 : 0.6 // Synapse's Theil-Sen takes the median of the pairwise slopes slightly differently
        expect(Math.abs(m.value! - w[0]), `${name} ${m.method} slope`).toBeLessThanOrEqual(tol)
        if (m.method !== 'TS') expect(Math.abs((m.detail!.intercept as number) - w[1]), `${name} ${m.method} intercept`).toBeLessThan(w[1] * 0.0006 + 30)
      }
      expect(x.length).toBe(name === 'd1' ? 4 : 41); expect(y.length).toBe(x.length)
    }
  })
  it('sensitivity at 5% trim matches, results and error: $25 / $88, 7,348 / 20,737', () => {
    const s1 = sensitivity(prep(r1!), FEATURES.gla, 1447, { min: 0, max: 400, step: 1, trimPct: 5 })
    const s2 = sensitivity(prep(r2!), FEATURES.gla, 1447, { min: 0, max: 400, step: 1, trimPct: 5 })
    expect(s1.value).toBe(25); expect(s2.value).toBe(88)
    expect(Math.abs(s1.mae! - 7348)).toBeLessThan(5); expect(Math.abs(s2.mae! - 20737)).toBeLessThan(5)
  })
  it('grouped data analyses match: dataset 2 gives $60 / $118 (average), $168 / $180 (median)', () => {
    const p1 = prep(r1!), p2 = prep(r2!)
    const v1 = p1.map((p) => p.values.gla as number)
    expect(median(v1)).toBe(1574)
    const an = groupAnalyses('sqft', median(v1), Math.min(...v1))
    const rate = (i: number, stat: 'avg' | 'median') => groupedData(p2, FEATURES.gla, an[i][0], an[i][1], stat).value!
    expect(Math.round(rate(0, 'avg'))).toBe(60); expect(Math.round(rate(1, 'avg'))).toBe(118)
    expect(Math.abs(rate(0, 'median') - 168)).toBeLessThan(1); expect(Math.abs(rate(1, 'median') - 180)).toBeLessThan(1)
    expect(groupedData(p1, FEATURES.gla, an[0][0], an[0][1], 'avg').status).toBe('no_result')
  })
  it('paired sales on dataset 2 land near Synapse (39 pairs, $51 / $59, error 122)', () => {
    const set = defaultPairedSettings()
    const res = pairedSales(prep(r2!), studiedWithRule(FEATURES.gla, set), matchFeatures(set), { removeOutliers: true })
    const n = findPairs(prep(r2!), studiedWithRule(FEATURES.gla, set), matchFeatures(set)).length
    expect(Math.abs(n - 39)).toBeLessThanOrEqual(4)
    expect(Math.abs(res[1].value! - 59)).toBeLessThan(6)
    expect(Math.abs(res[0].value! - 51)).toBeLessThan(8)
  })
  it('full bath and half bath match on dataset 2 for every regression method; RLMS is an invalid response', () => {
    const want: Record<string, Record<string, number>> = {
      baths_full: { OLS: 81205, ROLS: 80466, TS: 80608, LAD: 80750, LMS: 62544, MODQ: 80466 },
      baths_half: { OLS: 17417, ROLS: 14835, TS: 21238, LAD: 21689, LMS: 47389, MODQ: 14835 },
    }
    for (const [k, w] of Object.entries(want)) {
      const props = prep(r2!).filter((p) => p.values[k] !== null)
      const got = regression(props, resolveFeature(k)!)
      for (const m of got) {
        if (m.method === 'RLMS') { expect(m.status).toBe('no_result'); continue }
        if (m.method === 'TS' || m.method === 'LAD') { expect(Math.abs(m.value! - w[m.method]) / w[m.method], `${k} ${m.method}`).toBeLessThan(0.005); continue }
        expect(Math.abs(m.value! - w[m.method]) / w[m.method], `${k} ${m.method}`).toBeLessThan(0.0005)
      }
    }
  })
  it('same-value features give no result in every method (garage spaces are all 2)', () => {
    const props = prep(r2!)
    expect(regression(props, FEATURES.garage).every((m) => m.status === 'no_result')).toBe(true)
    expect(sensitivity(props, FEATURES.garage, 2, { min: -100, max: 100, step: 1 }).status).toBe('no_result')
  })
  it('year built is analysed as a calendar year: dataset 1 paired sales find one pair at $10,894', () => {
    const set = defaultPairedSettings()
    const res = pairedSales(prep(r1!), studiedWithRule(FEATURES.year_built, set), matchFeatures(set), { removeOutliers: true })
    expect(Math.round(res[0].value!)).toBe(10894)
  })
})

describe.skipIf(!fs.existsSync(path.resolve(__dirname, '../.sample/john/mc.csv')))('real 1004MC export (John Rolfe Ln, 68 listings of every status)', () => {
  const mcFile = path.resolve(__dirname, '../.sample/john/mc.csv')
  const r = fs.existsSync(mcFile) ? importMarketCsv(fs.readFileSync(mcFile, 'utf8')) : (null as unknown as ReturnType<typeof importMarketCsv>)
  it('reads every listing and every status', () => {
    expect(r.missing).toEqual([])
    expect(r.listings).toHaveLength(68)
    expect(new Set(r.listings.map((l) => l.status))).toEqual(new Set(['Sold', 'Active', 'Terminated', 'Expired', 'Withdrawn', 'Pending', 'Option Pending']))
  })
  it('gives the 1004MC counts: 22 closed sales in 12 months, split 10 / 8 / 4, with 13 / 10 / 3 active listings at the period ends', () => {
    const mc = mc1004(r.listings, '2026-10-09')
    expect(mc.map((c) => c.sales)).toEqual([10, 8, 4])
    expect(mc.map((c) => c.actives)).toEqual([13, 10, 3])
    expect(mc[2].monthsSupply).toBeCloseTo(2.25, 6)
  })
  it('flags the one REO closed sale', () => { expect(reoStats(r.listings, '2026-10-09').reo).toBe(1) })
})


describe.skipIf(!haveJ)('lot, interior and community groups on the John Rolfe Ln neighborhood export', () => {
  const neighFile = path.join(path.resolve(__dirname, '../.sample/john'), 'neigh.csv')
  const props = fs.existsSync(neighFile) ? importCsv(fs.readFileSync(neighFile, 'utf8'), '2026-10-09').properties : []
  const count = (k: string) => props.filter((p) => p.values[k] === 1).length
  it('counts what the MLS text says', () => {
    expect(count('grp:lot:Cul-de-sac')).toBe(5)
    expect(count('grp:lot:Corner')).toBe(1)
    expect(count('grp:lot:Wooded')).toBe(2)
    expect(count('grp:community:Community pool')).toBe(8)
    expect(count('grp:community:Clubhouse')).toBe(7)
    expect(count('grp:interior:High or vaulted ceilings')).toBe(15)
  })
})
