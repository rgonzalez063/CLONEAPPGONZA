'use client'
import { useState, type ReactNode } from 'react'

const COLORS = ['var(--color-dataset-1)', 'var(--color-dataset-2)', 'var(--color-dataset-3)']
const muted = 'var(--color-text-muted)'

/** One headline figure with its label. A number alone needs no plot. */
export function Tile({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' }) {
  return (
    <div className="rounded-md border border-border bg-bg p-3">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${tone === 'warn' ? 'text-warning' : ''}`}>{value}</div>
      {sub && <div className="text-xs text-text-muted">{sub}</div>}
    </div>
  )
}

/** The numbers behind a chart, for anyone who prefers to read them. */
export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1">
      <button type="button" className="text-xs text-accent" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} the numbers</button>
      {open && (
        <div className="mt-1 max-h-48 overflow-auto">
          <table className="w-full text-xs"><thead><tr className="text-left text-text-muted">{head.map((h) => <th key={h} className="px-2 py-0.5">{h}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-border">{r.map((c, j) => <td key={j} className="px-2 py-0.5 tabular-nums">{c}</td>)}</tr>)}</tbody></table>
        </div>
      )}
    </div>
  )
}

export function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <figure className="rounded-md border border-border bg-bg p-3">
      <figcaption className="mb-2"><span className="text-sm font-semibold">{title}</span>{note && <span className="block text-xs text-text-muted">{note}</span>}</figcaption>
      {children}
    </figure>
  )
}

/** Vertical bars from a zero baseline, with a 4px rounded top and a gap between them. One series, so no legend. */
export function Bars({ title, items, format, note, color = 0 }: { title: string; items: { label: string; value: number; hint?: string }[]; format: (v: number) => string; note?: string; color?: number }) {
  const W = 520, H = 170, L = 8, B = 24, T = 14
  if (!items.length) return <Panel title={title} note={note}><p className="text-xs text-text-muted">Nothing to show yet.</p></Panel>
  const max = Math.max(...items.map((i) => i.value), 1)
  const slot = (W - L * 2) / items.length
  const bw = Math.min(40, slot - 2)
  const every = Math.ceil(items.length / 8)
  return (
    <Panel title={title} note={note}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${items.map((i) => `${i.label} ${format(i.value)}`).join(', ')}`} className="w-full">
        <line x1={L} x2={W - L} y1={H - B} y2={H - B} stroke="var(--color-chart-grid)" strokeWidth="1" />
        {items.map((it, i) => {
          const h = Math.max(it.value > 0 ? 2 : 0, (it.value / max) * (H - B - T))
          const x = L + i * slot + (slot - bw) / 2
          const y = H - B - h
          return (
            <g key={i}>
              <title>{`${it.label}: ${format(it.value)}${it.hint ? ` (${it.hint})` : ''}`}</title>
              {h > 0 && <path d={`M${x},${H - B} V${y + Math.min(4, h)} Q${x},${y} ${x + Math.min(4, bw / 2)},${y} H${x + bw - Math.min(4, bw / 2)} Q${x + bw},${y} ${x + bw},${y + Math.min(4, h)} V${H - B} Z`} fill={COLORS[color]} />}
              {items.length <= 12 && it.value > 0 && <text x={x + bw / 2} y={y - 3} textAnchor="middle" fontSize="10" fill={muted}>{format(it.value)}</text>}
              {i % every === 0 && <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill={muted}>{it.label.length > 11 ? `${it.label.slice(0, 10)}…` : it.label}</text>}
            </g>
          )
        })}
      </svg>
      <DataTable head={['', 'Value']} rows={items.map((i) => [i.label, format(i.value)])} />
    </Panel>
  )
}

export interface ScatterSeries { name: string; points: { x: number; y: number; id: string }[] }
/** Price against size. Each dataset keeps its own colour and shape; the subject is a marked vertical line. */
export function Scatter({ title, series, subjectX, xFormat, yFormat, xLabel, note }: {
  title: string; series: ScatterSeries[]; subjectX?: number | null; xFormat: (v: number) => string; yFormat: (v: number) => string; xLabel: string; note?: string
}) {
  const W = 520, H = 240, L = 58, R = 12, T = 12, B = 34
  const all = series.flatMap((s) => s.points)
  if (all.length < 2) return <Panel title={title} note={note}><p className="text-xs text-text-muted">Not enough points yet.</p></Panel>
  const xs = [...all.map((p) => p.x), ...(subjectX ? [subjectX] : [])]
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...all.map((p) => p.y)), y1 = Math.max(...all.map((p) => p.y))
  const px = (v: number) => L + ((v - x0) / (x1 - x0 || 1)) * (W - L - R)
  const py = (v: number) => T + (1 - (v - y0) / (y1 - y0 || 1)) * (H - T - B)
  return (
    <Panel title={title} note={note}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${all.length} sales, ${xFormat(x0)} to ${xFormat(x1)} on the horizontal axis, ${yFormat(y0)} to ${yFormat(y1)} on the vertical`} className="w-full">
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--color-chart-grid)" /><line x1={L} x2={L} y1={T} y2={H - B} stroke="var(--color-chart-grid)" />
        {[0, 0.5, 1].map((t) => <text key={t} x={L - 6} y={py(y0 + t * (y1 - y0)) + 3} textAnchor="end" fontSize="10" fill={muted}>{yFormat(y0 + t * (y1 - y0))}</text>)}
        {[0, 0.5, 1].map((t) => <text key={t} x={px(x0 + t * (x1 - x0))} y={H - B + 14} textAnchor={t === 0 ? 'start' : t === 1 ? 'end' : 'middle'} fontSize="10" fill={muted}>{xFormat(x0 + t * (x1 - x0))}</text>)}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" fontSize="10" fill={muted}>{xLabel}</text>
        {subjectX ? <g><line x1={px(subjectX)} x2={px(subjectX)} y1={T} y2={H - B} stroke="var(--color-chart-marker)" strokeWidth="1.5" strokeDasharray="4 3" /><text x={px(subjectX) + 4} y={T + 9} fontSize="10" fill={muted}>Subject {xFormat(subjectX)}</text></g> : null}
        {series.map((s, si) => s.points.map((p) => {
          const cx = px(p.x), cy = py(p.y), c = COLORS[si % 3]
          return (
            <g key={`${si}-${p.id}`}><title>{`${s.name}, ${p.id}: ${xFormat(p.x)}, ${yFormat(p.y)}`}</title>
              {si % 3 === 0 && <circle cx={cx} cy={cy} r="4" fill={c} stroke="var(--color-bg)" strokeWidth="2" />}
              {si % 3 === 1 && <rect x={cx - 4} y={cy - 4} width="8" height="8" fill={c} stroke="var(--color-bg)" strokeWidth="2" />}
              {si % 3 === 2 && <polygon points={`${cx},${cy - 5.5} ${cx + 5.5},${cy} ${cx},${cy + 5.5} ${cx - 5.5},${cy}`} fill={c} stroke="var(--color-bg)" strokeWidth="2" />}
            </g>
          )
        }))}
      </svg>
      {series.length > 1 && (
        <ul className="mt-1 flex flex-wrap gap-3 text-xs" aria-label="Legend">
          {series.map((s, i) => <li key={s.name} className="flex items-center gap-1"><svg width="10" height="10" aria-hidden><circle cx="5" cy="5" r="4" fill={COLORS[i % 3]} /></svg>{s.name} ({s.points.length})</li>)}
        </ul>
      )}
      <DataTable head={['Dataset', 'ID', xLabel, 'Price']} rows={series.flatMap((s) => s.points.map((p) => [s.name, p.id, xFormat(p.x), yFormat(p.y)]))} />
    </Panel>
  )
}
