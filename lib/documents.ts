import { resolveFeature } from './features'
import { describeRule, matchFeatures } from './pairedSettings'
import { featureComment, relevantResults, METHOD_NAMES, TRANSACTIONAL_SENTENCE, defaultCommentOptions, type CommentOptions } from './comments'
import { money, perUnit } from './format'
import type { DatasetResults, PreparedDataset } from './analysis'
import type { Session, WidgetState } from './store'
import type { MethodResult } from '@/engines'

/** A tiny document model that both the PDF and the RTF writers render. */
export type Block =
  | { kind: 'title'; text: string }
  | { kind: 'h'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }

export interface ReportInput {
  session: Session
  prepared: PreparedDataset[]
  results: Record<string, DatasetResults[]>
  widgets: Record<string, WidgetState>
  commentOptions: Record<string, CommentOptions>
  analysisDate: string // yyyy-mm-dd
}

const finished = (i: ReportInput) => Object.keys(i.widgets).filter((k) => i.widgets[k].done && i.widgets[k].chosen !== null && resolveFeature(k))
const featureOf = (k: string) => resolveFeature(k)!

function summaryLines(i: ReportInput): string {
  const counts = i.prepared.map((d) => d.props.length)
  const range = counts.length ? (Math.min(...counts) === Math.max(...counts) ? `${counts[0]}` : `${Math.min(...counts)} to ${Math.max(...counts)}`) : '0'
  return [
    `Subject: ${i.session.subject?.address ?? i.session.name}`,
    `Effective date: ${i.session.effectiveDate}`,
    `Analysis date: ${i.analysisDate}`,
    `Datasets analyzed: ${i.prepared.length}; properties per dataset: ${range}`,
  ].join('\n')
}

// ------------------------------------------------------------------ primary summary
const CODES: { code: string; match: (r: MethodResult) => boolean; name: string }[] = [
  { code: 'TPS.A', match: (r) => r.method === 'TPS' && r.variant === 'avg', name: 'True paired sales (average)' },
  { code: 'TPS.M', match: (r) => r.method === 'TPS' && r.variant === 'median', name: 'True paired sales (median)' },
  { code: 'GD.A', match: (r) => r.method === 'GD' && r.variant.startsWith('avg'), name: 'Grouped data (average)' },
  { code: 'GD.M', match: (r) => r.method === 'GD' && r.variant.startsWith('median'), name: 'Grouped data (median)' },
  { code: 'COST', match: (r) => r.method === 'DC', name: 'Depreciated cost' },
  { code: 'SENS', match: (r) => r.method === 'SENS', name: 'Sensitivity' },
  { code: 'OLS', match: (r) => r.method === 'OLS', name: 'Ordinary least squares regression' },
  { code: 'ROLS', match: (r) => r.method === 'ROLS', name: 'Robust ordinary least squares' },
  { code: 'TS', match: (r) => r.method === 'TS', name: 'Theil-Sen regression' },
  { code: 'LAD', match: (r) => r.method === 'LAD', name: 'Least absolute deviation regression' },
  { code: 'LMS', match: (r) => r.method === 'LMS', name: 'Least median of squares' },
  { code: 'RLMS', match: (r) => r.method === 'RLMS', name: 'Robust least median of squares' },
  { code: 'ModQ', match: (r) => r.method === 'MODQ', name: 'Modified quantile regression' },
]

export function buildSummary(i: ReportInput): Block[] {
  const blocks: Block[] = [
    { kind: 'title', text: 'Sales comparison adjustment support' },
    { kind: 'p', text: summaryLines(i) },
    { kind: 'p', text: TRANSACTIONAL_SENTENCE },
    { kind: 'table', head: ['Code', 'Method'], rows: CODES.map((c) => [c.code, c.name]) },
    { kind: 'p', text: 'Results by method. A star means the appraiser gave that result no weight (it lies outside the limits set on screen). A blank cell means the method gave no result.' },
  ]
  for (const k of finished(i)) {
    const f = featureOf(k)
    const w = i.widgets[k]
    const data = i.results[k] ?? []
    const used = CODES.filter((c) => data.some((d) => d.results.some((r) => c.match(r) && r.status === 'ok')))
    const rows = data.map((d) => [d.name, ...used.map((c) => {
      const hits = d.results.filter((x) => c.match(x) && x.status === 'ok' && x.value !== null)
      if (!hits.length) return ''
      // Grouped data has two analyses; both values go in one cell.
      return hits.map((r) => `${relevantResults([{ ...d, results: [r] }], w).length > 0 ? '' : '*'}${money(r.value as number)}`).join(' | ')
    })])
    rows.push(['Chosen', money(w.chosen as number) + perUnit(f.unit), ...used.slice(1).map(() => '')])
    blocks.push({ kind: 'h', text: `${f.label}: ${money(w.chosen as number)}${perUnit(f.unit)}` })
    blocks.push({ kind: 'table', head: ['Dataset', ...used.map((c) => c.code)], rows })
  }
  if (!finished(i).length) blocks.push({ kind: 'p', text: 'No feature has been marked Done yet.' })
  return blocks
}

// ------------------------------------------------------------------ comments
export function buildComments(i: ReportInput, withTransactional = true): Block[] {
  const blocks: Block[] = [{ kind: 'title', text: 'Adjustment comments' }]
  if (withTransactional) blocks.push({ kind: 'p', text: TRANSACTIONAL_SENTENCE })
  for (const k of finished(i)) {
    const c = featureComment(featureOf(k), i.widgets[k], i.results[k] ?? [], i.commentOptions[k] ?? defaultCommentOptions)
    if (c) blocks.push({ kind: 'h', text: c.feature }, { kind: 'p', text: c.text })
  }
  if (blocks.length <= (withTransactional ? 2 : 1)) blocks.push({ kind: 'p', text: 'No feature has been marked Done yet.' })
  return blocks
}

// ------------------------------------------------------------------ method overview (own wording)
const OVERVIEW: Record<string, string> = {
  TPS: 'Paired sales. Two sales that match on every other feature but differ on the one studied are compared; the price difference divided by the feature difference is a rate. The average and the median over all pairs are reported. Rates beyond 1.5 times the interquartile range are set aside.',
  GD: 'Grouped data. Sales are split into two groups by the studied feature. The difference in group price (average or median) divided by the difference in group feature size is the rate. A group needs at least two sales.',
  DC: 'Depreciated cost. The cost to build three sizes of house (the kitchen taken out, wear taken off by effective age over life) from your own cost per square foot; the difference per foot between neighbouring sizes, averaged, is the result.',
  SENS: 'Sensitivity. Each candidate rate is applied to every sale, moving its price to the subject. The rate that makes the adjusted prices most alike (smallest range, after trimming the extremes) is the result.',
  OLS: 'Ordinary least squares. The slope of the line through price against the feature, found by minimizing squared errors.',
  ROLS: 'Robust least squares. The same slope formula, centered on medians instead of means, so unusual sales pull it less.',
  TS: 'Theil-Sen. The median of the slopes of every line through two sales, which resists outliers.',
  LAD: 'Least absolute deviation. Of all lines through two sales, the one with the smallest sum of absolute errors.',
  LMS: 'Least median of squares. The ordinary least squares slope formula with each sum replaced by a median, which shrinks the pull of a few unusual sales.',
  RLMS: 'Robust least median of squares. The same, with the medians (not the means) as the center of the data.',
  MODQ: 'Modified quantile. Robust least squares tried with the feature centered on its 10th through 90th percentile, keeping the one with the best fit.',
}
export function buildMethodOverview(i: ReportInput): Block[] {
  const used = new Set(Object.values(i.results).flat().flatMap((d) => d.results).filter((r) => r.status === 'ok').map((r) => r.method))
  const blocks: Block[] = [
    { kind: 'title', text: 'Adjustment method overview' },
    { kind: 'p', text: 'This tool calculates results; it does not decide the adjustment. The appraiser reviews the results, sets aside any that are not credible, and forms an opinion.' },
    { kind: 'h', text: 'Transactional adjustments' },
    { kind: 'p', text: TRANSACTIONAL_SENTENCE },
    { kind: 'h', text: 'Modeling' },
    { kind: 'p', text: 'When an adjustment is modeled, every sale price in the datasets is moved to the subject by that adjustment before other features are calculated, so one feature does not distort the next. Finished features are locked and are not recalculated.' },
    { kind: 'h', text: 'Methods used' },
  ]
  for (const m of Object.keys(OVERVIEW)) if (used.has(m as MethodResult['method'])) blocks.push({ kind: 'p', text: OVERVIEW[m] })
  return blocks
}

// ------------------------------------------------------------------ details per feature
export function buildFeatureDetails(i: ReportInput, key: string): Block[] {
  const f = featureOf(key)
  const w = i.widgets[key]
  const blocks: Block[] = [
    { kind: 'title', text: `${f.label} details` },
    { kind: 'p', text: `${w.chosen !== null ? `Opinion of the adjustment: ${money(w.chosen)}${perUnit(f.unit)}.` : 'No adjustment chosen yet.'}\n${summaryLines(i)}` },
  ]
  for (const d of i.results[key] ?? []) {
    blocks.push({ kind: 'h', text: `${d.name} (${d.count} sales)` })
    blocks.push({
      kind: 'table', head: ['Method', 'Result', 'Error', 'Weight', 'Note'],
      rows: d.results.map((r) => [
        METHOD_NAMES[r.method] + (r.variant ? ` (${r.variant})` : ''),
        r.value !== null ? money(r.value) : '',
        r.mae !== null ? Math.round(r.mae).toLocaleString('en-US') : '',
        r.value === null ? '' : relevantResults([{ ...d, results: [r] }], w).length ? 'yes' : 'no',
        r.reason ?? '',
      ]),
    })
  }
  return blocks
}

// ------------------------------------------------------------------ settings and property information
export function buildSettings(i: ReportInput): Block[] {
  const t = i.session.transactional
  return [
    { kind: 'title', text: 'Settings used' },
    { kind: 'h', text: 'Transactional adjustments' },
    { kind: 'table', head: ['Setting', 'Value'], rows: [
      ['Remove leasehold sales', String(t?.removeLeasehold ?? true)], ['Remove owner or seller financed sales', String(t?.removeNonCash ?? true)],
      ['Remove REO sales', String(t?.removeREO ?? true)], ['Remove short sales', String(t?.removeShortSale ?? true)],
      ['Deduct seller concessions', String(t?.deductConcessions ?? true)], ['Time basis', t?.timeBasis ?? 'contract'], ['Time trend', t?.timeModel ?? 'best'],
    ] },
    { kind: 'h', text: 'Time adjustment by dataset' },
    { kind: 'table', head: ['Dataset', 'Trend', 'Coefficients', 'Fit (r squared)', 'Oldest date'], rows: i.prepared.map((d) => [
      d.name, d.report.timeModel, d.report.trend?.coefficients.map((c) => c.toFixed(4)).join(', ') ?? '', d.report.trend ? d.report.trend.r2.toFixed(3) : '', d.report.oldestDate ?? '',
    ]) },
    { kind: 'h', text: 'Paired sales: properties must match on' },
    { kind: 'table', head: ['Feature', 'Tolerance'], rows: matchFeatures(i.session.pairedSettings).map((f) => [f.label, describeRule(f.rule)]) },
    { kind: 'p', text: `Pair rates beyond 1.5 times the interquartile range are ${(i.session.pairedSettings?.removeOutliers ?? true) ? 'set aside' : 'kept'}.` },
  ]
}

function manualBlocks(i: ReportInput): Block[] {
  const removed: string[][] = []
  const edited: string[][] = []
  for (const d of i.session.datasets) {
    for (const p of d.properties) {
      if (p.deleted) removed.push([d.name, p.id])
      for (const [field, e] of Object.entries(p.edits ?? {})) edited.push([d.name, p.id, field, String(e.from ?? 'empty'), String(e.to ?? 'empty')])
    }
  }
  return [
    { kind: 'h', text: 'Sales removed by hand' },
    removed.length ? { kind: 'table', head: ['Dataset', 'MLS #'], rows: removed } : { kind: 'p', text: 'None.' },
    { kind: 'h', text: 'Values edited by hand' },
    edited.length ? { kind: 'table', head: ['Dataset', 'MLS #', 'Field', 'Original', 'Now'], rows: edited } : { kind: 'p', text: 'None.' },
  ]
}

export function buildPropertyInfo(i: ReportInput): Block[] {
  return [
    { kind: 'title', text: 'Property information' },
    { kind: 'h', text: 'Sales left out before analysis' },
    { kind: 'table', head: ['Dataset', 'Leasehold', 'Seller financed', 'REO', 'Short sale', 'After effective date'], rows: i.prepared.map((d) => [
      d.name, String(d.report.removed.leasehold), String(d.report.removed.nonCash), String(d.report.removed.reo), String(d.report.removed.shortSale), String(d.excludedAfterEffective),
    ]) },
    ...manualBlocks(i),
  ]
}

/** Normalized sales used in the analysis, one row per sale, as CSV. */
export function propertiesCsv(i: ReportInput): string {
  const keys = ['gla', 'lot_size', 'baths_full', 'baths_half', 'garage', 'carport', 'stories', 'beds', 'fireplaces', 'pool', 'age']
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const lines = [['dataset', 'mls_number', 'adjusted_price', ...keys].join(',')]
  for (const d of i.prepared) for (const p of d.props) lines.push([esc(d.name), esc(p.id), p.price.toFixed(2), ...keys.map((k) => (p.values[k] ?? '').toString())].join(','))
  return lines.join('\n')
}
