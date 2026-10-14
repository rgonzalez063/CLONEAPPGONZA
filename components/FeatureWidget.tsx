'use client'
import { useMemo, useState } from 'react'
import type { FeatureDef, MethodResult } from '@/engines'
import type { DatasetResults } from '@/lib/analysis'
import type { WidgetState } from '@/lib/store'
import { Toggle } from './ui'

const ROWS: { label: string; match: (r: MethodResult) => boolean }[] = [
  { label: 'Paired Sales', match: (r) => r.method === 'TPS' },
  { label: 'Grouped Data', match: (r) => r.method === 'GD' },
  { label: 'Regression', match: (r) => r.method === 'OLS' || r.method === 'TS' || r.method === 'ROLS' || r.method === 'LAD' || r.method === 'LMS' || r.method === 'RLMS' || r.method === 'MODQ' },
  { label: 'Sensitivity', match: (r) => r.method === 'SENS' },
]
const NAMES: Record<string, string> = { TPS: 'Paired sales', GD: 'Grouped data', OLS: 'OLS regression', TS: 'Theil-Sen regression', ROLS: 'Robust OLS regression', LAD: 'Least absolute deviation', LMS: 'Least median of squares', RLMS: 'Robust least median of squares', MODQ: 'Modified quantile regression', SENS: 'Sensitivity' }
const COLORS = ['var(--color-dataset-1)', 'var(--color-dataset-2)', 'var(--color-dataset-3)']
const SHAPES = ['circle', 'square', 'diamond'] as const

const fmt = (v: number, unit: string) => {
  const a = Math.abs(v)
  const s = a >= 1000 ? Math.round(a).toLocaleString() : a >= 100 ? a.toFixed(0) : a.toFixed(2)
  return `${v < 0 ? '-' : ''}$${s}${unit === 'sqft' ? '' : ''}`
}

function Dot({ shape, x, y, color, r, ring }: { shape: (typeof SHAPES)[number]; x: number; y: number; color: string; r: number; ring: boolean }) {
  const common = { fill: color, stroke: ring ? 'var(--color-chart-marker)' : 'none', strokeWidth: 1.5 }
  if (shape === 'square') return <rect x={x - r} y={y - r} width={r * 2} height={r * 2} {...common} />
  if (shape === 'diamond') return <polygon points={`${x},${y - r * 1.3} ${x + r * 1.3},${y} ${x},${y + r * 1.3} ${x - r * 1.3},${y}`} {...common} />
  return <circle cx={x} cy={y} r={r} {...common} />
}

export function FeatureWidget({ feature, data, state, onChange, onRemove, subjectValue, subjectEditable = false }: {
  feature: FeatureDef
  data: DatasetResults[]
  state: WidgetState
  onChange: (patch: Partial<WidgetState>) => void
  onRemove: () => void
  subjectValue: number | null
  subjectEditable?: boolean
}) {
  const [table, setTable] = useState(false)
  const W = 400, left = 96, right = 14, rowH = 22, top = 8
  const flat = useMemo(
    () => data.flatMap((d, di) => d.results.filter((r) => r.status === 'ok' && r.value !== null).map((r) => ({ ...r, di, ds: d.name }))),
    [data],
  )
  const all = flat.map((r) => r.value as number)
  const dMin = all.length ? Math.min(...all, state.chosen ?? Infinity) : 0
  const dMax = all.length ? Math.max(...all, state.chosen ?? -Infinity) : 1
  const pad = (dMax - dMin || 1) * 0.05
  const full = { lo: dMin - pad, hi: dMax + pad }
  const low = state.low ?? full.lo
  const high = state.high ?? full.hi
  const dom = state.snip ? { lo: low, hi: high } : full
  const x = (v: number) => left + ((v - dom.lo) / (dom.hi - dom.lo || 1)) * (W - left - right)
  const rows = ROWS.filter((row) => flat.some(row.match))
  const H = top + rows.length * rowH + 40
  const bestMae = Math.min(...flat.map((r) => r.mae ?? Infinity))
  const chosenOutside = state.chosen !== null && (state.chosen < low || state.chosen > high)
  const excluded = data.flatMap((d) => d.results.filter((r) => r.status !== 'ok').map((r) => ({ ...r, ds: d.name })))
  const setChosen = (v: number | null) => onChange({ chosen: v, done: v !== null ? true : false, locked: v !== null ? true : state.locked })

  return (
    <section aria-label={`${feature.label} adjustment`} className={`flex flex-col gap-2 rounded-md p-3 shadow-card ${state.done ? 'bg-surface-done' : 'bg-bg'}`}>
      <div className="flex items-center justify-between">
        <span className={chosenOutside ? 'text-warning' : 'invisible'} role={chosenOutside ? 'status' : undefined} title="Your value is inside a range you excluded">
          {chosenOutside ? '⚠ value is in an excluded range' : '.'}
        </span>
        <button type="button" aria-label={`Remove ${feature.label}`} onClick={onRemove} className="px-2 text-text-muted">✕</button>
      </div>

      {all.length === 0 ? (
        <p className="py-8 text-center text-text-muted">No results yet. {excluded[0]?.reason ? `Reason: ${excluded[0].reason}.` : 'Load data and set the subject.'}</p>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <label className="flex flex-1 items-center gap-1">Low limit
              <input type="range" aria-label={`${feature.label} low limit`} className="flex-1" min={full.lo} max={full.hi} step={(full.hi - full.lo) / 200}
                value={low} onChange={(e) => onChange({ low: Math.min(Number(e.target.value), high) })} />
            </label>
            <label className="flex flex-1 items-center gap-1">High limit
              <input type="range" aria-label={`${feature.label} high limit`} className="flex-1" min={full.lo} max={full.hi} step={(full.hi - full.lo) / 200}
                value={high} onChange={(e) => onChange({ high: Math.max(Number(e.target.value), low) })} />
            </label>
            {(state.low !== null || state.high !== null) && (
              <button type="button" className="text-accent" onClick={() => onChange(state.snip ? { snip: false } : { snip: true })}>{state.snip ? 'Reset' : 'Snip'}</button>
            )}
          </div>

          <svg role="img" aria-label={`${feature.label} results by method`} width="100%" viewBox={`0 0 ${W} ${H}`}>
            {rows.map((row, i) => {
              const y = top + i * rowH + rowH / 2
              return (
                <g key={row.label}>
                  <text x={left - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--color-text-muted)">{row.label}</text>
                  <line x1={left} x2={W - right} y1={y} y2={y} stroke="var(--color-border)" />
                  {flat.filter(row.match).map((r, k) => {
                    const v = r.value as number
                    if (v < dom.lo || v > dom.hi) return null
                    const out = v < low || v > high
                    return <g key={k} opacity={out ? 0.3 : 1}><title>{`${NAMES[r.method]}${r.variant ? ` (${r.variant})` : ''}, ${r.ds}: ${fmt(v, feature.unit)}${r.mae !== null ? `, error ${Math.round(r.mae).toLocaleString()}` : ''}`}</title>
                      <Dot shape={SHAPES[r.di % 3]} x={x(v)} y={y} color={COLORS[r.di % 3]} r={r.mae !== null && r.mae === bestMae ? 6 : 4} ring={r.mae === bestMae} /></g>
                  })}
                </g>
              )
            })}
            {state.chosen !== null && state.chosen >= dom.lo && state.chosen <= dom.hi && (
              <line x1={x(state.chosen)} x2={x(state.chosen)} y1={top} y2={top + rows.length * rowH} stroke="var(--color-chart-marker)" strokeWidth="2" />
            )}
            <line x1={left} x2={W - right} y1={top + rows.length * rowH} y2={top + rows.length * rowH} stroke="var(--color-chart-grid)" />
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const v = dom.lo + t * (dom.hi - dom.lo)
              return <text key={t} x={x(v)} y={top + rows.length * rowH + 14} textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'} fontSize="10" fill="var(--color-text-muted)">{fmt(v, feature.unit)}</text>
            })}
            {data.map((d, i) => (
              <g key={d.slot} transform={`translate(${left + i * 90}, ${H - 8})`}>
                <Dot shape={SHAPES[i % 3]} x={0} y={-3} color={COLORS[i % 3]} r={4} ring={false} />
                <text x={9} y={0} fontSize="10" fill="var(--color-text-muted)">{d.name} ({d.count})</text>
              </g>
            ))}
          </svg>

          <div className="flex items-center gap-3">
            <input type="range" aria-label={`${feature.label} adjustment`} aria-valuetext={state.chosen === null ? 'not set' : fmt(state.chosen, feature.unit)}
              className="flex-1" min={full.lo} max={full.hi} step={(full.hi - full.lo) / 400} value={state.chosen ?? (full.lo + full.hi) / 2}
              onChange={(e) => setChosen(Number(e.target.value))} />
            <input type="number" aria-label={`${feature.label} adjustment value`} className="h-8 w-28 rounded-sm border border-border-input px-2"
              value={state.chosen ?? ''} placeholder="value" onChange={(e) => setChosen(e.target.value === '' ? null : Number(e.target.value))} />
          </div>
        </>
      )}

      <div className="flex items-end justify-between">
        <label className="flex items-center gap-2 text-text-muted">
          <input type="checkbox" checked={state.done} onChange={(e) => onChange({ done: e.target.checked, locked: e.target.checked ? true : state.locked })} /> Done
        </label>
        <div className="text-center font-semibold">{feature.label}{feature.unit === 'sqft' ? ' (per sqft)' : ''}</div>
        <div className="flex flex-col">
          <Toggle label="Lock calculations" checked={state.locked} onChange={(v) => onChange({ locked: v })} />
          <Toggle label="Model" checked={state.model} disabled={state.chosen === null} onChange={(v) => onChange({ model: v })} />
        </div>
      </div>

      <button type="button" className="self-start text-xs text-accent" aria-expanded={table} onClick={() => setTable(!table)}>{table ? 'Hide' : 'Show'} results as a table</button>
      {table && (
        <table className="w-full text-xs">
          <thead><tr className="text-left text-text-muted"><th>Dataset</th><th>Method</th><th className="text-right">Result</th><th className="text-right">Error</th><th>Note</th></tr></thead>
          <tbody>
            {data.flatMap((d) => d.results.map((r, i) => (
              <tr key={`${d.slot}-${i}`} className="border-t border-border">
                <td>{d.name}</td><td>{NAMES[r.method]}{r.variant ? ` (${r.variant})` : ''}</td>
                <td className="text-right">{r.value !== null ? fmt(r.value, feature.unit) : '-'}</td>
                <td className="text-right">{r.mae !== null ? Math.round(r.mae).toLocaleString() : '-'}</td>
                <td>{r.reason ?? ''}</td>
              </tr>
            )))}
          </tbody>
        </table>
      )}
      {subjectEditable && (
        feature.unit === 'yes/no' ? (
          <label className="flex items-center gap-2 text-xs text-text-muted">
            <input type="checkbox" checked={subjectValue === 1} onChange={(e) => onChange({ subject: e.target.checked ? 1 : 0 })} /> The subject has this
          </label>
        ) : (
          <label className="flex items-center gap-2 text-xs text-text-muted">The subject&apos;s value
            <input type="number" className="h-7 w-24 rounded-sm border border-border-input px-2" value={subjectValue ?? ''} onChange={(e) => onChange({ subject: e.target.value === '' ? null : Number(e.target.value) })} />
          </label>
        )
      )}
      {subjectValue === null && !subjectEditable && <p className="text-xs text-text-muted">The subject has no {feature.label} value; sensitivity needs it.</p>}
    </section>
  )
}
