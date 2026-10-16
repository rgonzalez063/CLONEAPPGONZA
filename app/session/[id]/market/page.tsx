'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { DropZone } from '@/components/DropZone'
import { Button } from '@/components/ui'
import {
  characteristics, concessionNarrative, concessionStats, marketNarrative, mc1004, monthlySeries, neighborhoodSummary, reoNarrative, reoStats,
  suggestAssistancePrevalent, trendSummary, type Listing, type McColumn,
} from '@/engines'
import { importMarketCsv } from '@/lib/marketImport'
import { deleteMarketFile, getMarketFiles, logEvent, putMarketFile, type MarketFile } from '@/lib/store'
import { useSession } from '@/lib/useSession'

const usd = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `$${Math.round(v).toLocaleString('en-US')}`)
const num = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }))
const pc = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '-' : `${v.toFixed(d)}%`)

const CONCLUSIONS: { key: string; label: string; options: string[] }[] = [
  { key: 'values', label: 'Property values', options: ['Increasing', 'Stable', 'Declining'] },
  { key: 'demand', label: 'Demand / supply', options: ['Shortage', 'In balance', 'Over supply'] },
  { key: 'marketing', label: 'Marketing time', options: ['Under 3 months', '3-6 months', 'Over 6 months'] },
]

const SLOT_NAMES = ['Competing sales and listings (the market area)', 'Neighborhood (optional, wider area)']

/** The rows of the 1004MC table, in the order of the form. */
const MC_ROWS: [string, (c: McColumn) => string][] = [
  ['Total comparable sales (settled)', (c) => String(c.sales)],
  ['Absorption rate (sales per month)', (c) => num(c.absorption, 2)],
  ['Total comparable active listings', (c) => String(c.actives)],
  ['Months of housing supply', (c) => num(c.monthsSupply, 1)],
  ['Median comparable sale price', (c) => usd(c.medSalePrice)],
  ['Median comparable sales days on market', (c) => num(c.medDom, 0)],
  ['Median comparable list price (actives)', (c) => usd(c.medListPrice)],
  ['Median sale price as % of list price', (c) => pc(c.medSaleToList)],
  ['Sales with seller concessions', (c) => pc(c.concessionPct, 0)],
]

function LineChart({ title, values, labels, format }: { title: string; values: (number | null)[]; labels: string[]; format: (v: number) => string }) {
  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null)
  const W = 520, H = 170, L = 52, B = 22, T = 10, R = 10
  if (pts.length < 2) return <div className="rounded-md border border-border p-3"><h3 className="text-sm font-semibold">{title}</h3><p className="text-xs text-text-muted">Not enough months with data.</p></div>
  const lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v))
  const span = hi - lo || 1
  const x = (i: number) => L + (i / (values.length - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / span) * (H - T - B)
  return (
    <figure className="rounded-md border border-border p-3">
      <figcaption className="mb-1 text-sm font-semibold">{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: from ${format(pts[0].v)} to ${format(pts[pts.length - 1].v)}`} className="w-full">
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--color-border)" />
        <text x={L - 4} y={y(hi) + 4} textAnchor="end" fontSize="10" fill="var(--color-text-muted)">{format(hi)}</text>
        <text x={L - 4} y={y(lo) + 4} textAnchor="end" fontSize="10" fill="var(--color-text-muted)">{format(lo)}</text>
        <polyline fill="none" stroke="var(--color-dataset-1)" strokeWidth="2" points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} />
        {pts.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r="3" fill="var(--color-dataset-1)"><title>{`${labels[p.i]}: ${format(p.v)}`}</title></circle>)}
        <text x={L} y={H - 6} fontSize="10" fill="var(--color-text-muted)">{labels[0]}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="10" fill="var(--color-text-muted)">{labels[labels.length - 1]}</text>
      </svg>
    </figure>
  )
}

export default function MarketPage() {
  const { id } = useParams<{ id: string }>()
  const { s, error: loadError } = useSession(id)
  const [files, setFiles] = useState<MarketFile[] | null>(null)
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'mc' | 'trend' | 'chars' | 'hood'>('mc')
  const [note, setNote] = useState<Record<string, string | boolean | null>>({})
  const [copied, setCopied] = useState('')

  const load = useCallback(() => { getMarketFiles(id).then((f) => { setFiles(f); setNote(f.find((x) => x.slot === 1)?.notes ?? {}) }).catch(() => setFiles([])) }, [id])
  useEffect(load, [load])

  const comp = files?.find((f) => f.slot === 1)
  const hoodFile = files?.find((f) => f.slot === 2)
  const eff = s?.effectiveDate ?? ''
  const source = String(note.source || s?.mls || 'The MLS')

  const mc = useMemo(() => (comp?.listings.length && eff ? mc1004(comp.listings, eff) : null), [comp, eff])
  const conc = useMemo(() => (comp?.listings.length && eff ? concessionStats(comp.listings, eff) : null), [comp, eff])
  const reo = useMemo(() => (comp?.listings.length && eff ? reoStats(comp.listings, eff) : null), [comp, eff])
  const trend = useMemo(() => (comp?.listings.length && eff ? trendSummary(comp.listings, eff) : null), [comp, eff])
  const series = useMemo(() => (comp?.listings.length && eff ? monthlySeries(comp.listings, eff, 12) : []), [comp, eff])
  const chars = useMemo(() => (comp?.listings.length && eff ? characteristics(comp.listings, eff) : []), [comp, eff])
  const hood = useMemo(() => { const l = (hoodFile ?? comp)?.listings; return l?.length && eff ? neighborhoodSummary(l, eff) : null }, [hoodFile, comp, eff])

  if (loadError) return <p role="alert" className="p-8 text-danger">{loadError}</p>
  if (s === undefined || files === null) return <p className="p-8 text-text-muted">Loading…</p>
  if (s === null) return <p className="p-8">Session not found. <Link className="text-accent" href="/sessions">Back to sessions</Link></p>

  async function onFile(slot: number, file: File) {
    setBusy(true)
    try {
      const r = importMarketCsv(await file.text())
      if (r.missing.length) { setErrors((e) => ({ ...e, [slot]: `This file is missing: ${r.missing.join(', ')}. Export every status (active, pending, sold, expired, withdrawn) with the list date.` })); return }
      const prior = files?.find((f) => f.slot === slot)?.listings ?? []
      const known = new Set(prior.map((l) => l.id))
      const merged = [...prior, ...r.listings.filter((l) => !known.has(l.id))].slice(0, 10000)
      await putMarketFile(id, slot, { name: file.name, listings: merged })
      void logEvent(id, 'market.loaded', { file: file.name, listings: r.listings.length })
      setErrors((e) => ({ ...e, [slot]: '' }))
      load()
    } catch (e) { setErrors((x) => ({ ...x, [slot]: e instanceof Error ? e.message : 'Could not save that file.' })) } finally { setBusy(false) }
  }
  async function saveNote(patch: Record<string, string | boolean | null>) {
    const next = { ...note, ...patch }
    setNote(next)
    await putMarketFile(id, 1, { notes: next }).catch(() => undefined)
  }

  const assistSuggested = conc ? suggestAssistancePrevalent(conc) : null
  const assist = typeof note.assist === 'boolean' ? note.assist : assistSuggested
  const marketText = trend ? marketNarrative(trend) : ''
  const concText = conc ? concessionNarrative(conc, source) : ''
  const reoText = reo ? reoNarrative(reo, source) : ''
  const conclusionText = CONCLUSIONS.every((c) => note[c.key])
    ? `Based on the figures above, property values are ${String(note.values).toLowerCase()}, demand and supply are ${String(note.demand).toLowerCase()}, and typical marketing time is ${String(note.marketing).toLowerCase()}.`
    : ''
  const fullText = [marketText, conclusionText, String(note.extra ?? '')].filter(Boolean).join(' ')
  const sourceLine = `The market conditions data came from ${source} with an effective date of ${eff}.`

  async function copy(text: string, what: string) {
    try { await navigator.clipboard.writeText(text); setCopied(what) } catch { setCopied('') }
    setTimeout(() => setCopied(''), 2000)
  }
  const statusCounts = (l: Listing[]) => {
    const c = { sold: 0, active: 0, pending: 0, other: 0 }
    for (const x of l) { if (/sold|closed/i.test(x.status)) c.sold++; else if (/active|coming/i.test(x.status)) c.active++; else if (/pending|contingent|option/i.test(x.status)) c.pending++; else c.other++ }
    return `${c.sold} sold, ${c.active} active, ${c.pending} pending, ${c.other} other`
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Market analysis: {s.subject?.address || s.name}</h1>
          <p className="text-text-muted">As of the effective date, {eff}. Load every listing status; nothing is filtered out here.</p>
        </div>
        <Link className="rounded-md border border-border-input px-3 py-2 text-sm" href={`/session/${id}/results`}>Back to results</Link>
      </div>

      <div className="mb-5 grid gap-4 md:grid-cols-2">
        {[1, 2].map((slot) => {
          const f = files.find((x) => x.slot === slot)
          return (
            <section key={slot} className="rounded-md border border-border p-3" aria-label={SLOT_NAMES[slot - 1]}>
              <h2 className="mb-1 text-sm font-semibold">{SLOT_NAMES[slot - 1]}</h2>
              {f && <p className="mb-2 text-xs text-text-muted">{f.name || 'file'}: {f.listings.length.toLocaleString('en-US')} listings ({statusCounts(f.listings)})</p>}
              <DropZone hasData={!!f} onFile={(file) => void onFile(slot, file)} error={errors[slot]} />
              {f && <Button variant="secondary" className="mt-2" onClick={async () => { await deleteMarketFile(id, slot); load() }}>Remove this file</Button>}
            </section>
          )
        })}
      </div>
      {busy && <p className="mb-3 text-text-muted" role="status">Saving…</p>}

      {!comp ? <p className="text-text-muted">Load the first file to see the 1004MC table.</p> : (
        <>
          <div role="tablist" aria-label="Market views" className="mb-3 flex flex-wrap gap-2">
            {([['mc', '1004MC'], ['trend', 'Monthly trends'], ['chars', 'Market characteristics'], ['hood', 'Neighborhood']] as const).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`rounded-md border px-3 py-2 text-sm ${tab === k ? 'border-accent font-semibold text-accent' : 'border-border-input'}`}>{label}</button>
            ))}
          </div>

          {tab === 'mc' && mc && (
            <section aria-label="1004MC table">
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-surface"><tr>
                    <th scope="col" className="px-3 py-2 text-left">Inventory analysis and median comparables</th>
                    {mc.map((c) => <th key={c.label} scope="col" className="px-3 py-2 text-right">{c.label}<div className="text-xs font-normal text-text-muted">to {c.end}</div></th>)}
                  </tr></thead>
                  <tbody>
                    {MC_ROWS.map(([label, fn]) => (
                      <tr key={label} className="border-t border-border"><th scope="row" className="px-3 py-2 text-left font-normal">{label}</th>{mc.map((c) => <td key={c.label} className="px-3 py-2 text-right tabular-nums">{fn(c)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <h2 className="mb-2 text-sm font-semibold">Your conclusions</h2>
                  <p className="mb-2 text-xs text-text-muted">The trend calls are yours. The numbers support them; they are not decided for you.</p>
                  <fieldset className="mb-3">
                    <legend className="text-sm">Seller-paid financial assistance prevalent?{assistSuggested !== null && typeof note.assist !== 'boolean' && <span className="text-xs text-text-muted"> (suggested from concessions)</span>}</legend>
                    {['Yes', 'No'].map((o) => (
                      <label key={o} className="mr-4 inline-flex items-center gap-1 text-sm"><input type="radio" name="assist" checked={(assist ? 'Yes' : 'No') === o} onChange={() => void saveNote({ assist: o === 'Yes' })} />{o}</label>
                    ))}
                  </fieldset>
                  {CONCLUSIONS.map((c) => (
                    <fieldset key={c.key} className="mb-2"><legend className="text-sm font-medium">{c.label}</legend>
                      {c.options.map((o) => <label key={o} className="mr-4 inline-flex items-center gap-1 text-sm"><input type="radio" name={c.key} checked={note[c.key] === o} onChange={() => void saveNote({ [c.key]: o })} />{o}</label>)}
                    </fieldset>
                  ))}
                  <label className="mt-2 block text-sm">Data source name
                    <input className="mt-1 h-9 w-full rounded-sm border border-border-input px-2" value={String(note.source ?? '')} placeholder={s.mls} onChange={(e) => setNote({ ...note, source: e.target.value })} onBlur={() => void saveNote({ source: String(note.source ?? '') })} />
                  </label>
                </div>
                <div>
                  <h2 className="mb-2 text-sm font-semibold">Wording for your report</h2>
                  {[['Market conditions', fullText], ['Seller concessions', concText], ['REO and short sales', reoText], ['Data source', sourceLine]].map(([label, text]) => (
                    <div key={label} className="mb-3 rounded-md border border-border p-2">
                      <div className="mb-1 flex items-center justify-between"><h3 className="text-sm font-medium">{label}</h3>
                        <Button variant="link" disabled={!text} onClick={() => void copy(text, label)}>{copied === label ? 'Copied' : 'Copy'}</Button></div>
                      <p className="text-sm">{text || 'Make your conclusions to complete this.'}</p>
                    </div>
                  ))}
                  <label className="block text-sm">Anything to add to the market conditions comment
                    <textarea className="mt-1 w-full rounded-sm border border-border-input p-2" rows={2} value={String(note.extra ?? '')} onChange={(e) => setNote({ ...note, extra: e.target.value })} onBlur={() => void saveNote({ extra: String(note.extra ?? '') })} />
                  </label>
                </div>
              </div>
            </section>
          )}

          {tab === 'trend' && (
            <section aria-label="Monthly trends" className="grid gap-4 md:grid-cols-2">
              <LineChart title="Median sale price" values={series.map((m) => m.medSalePrice)} labels={series.map((m) => m.label)} format={usd as (v: number) => string} />
              <LineChart title="Months of supply" values={series.map((m) => m.supply)} labels={series.map((m) => m.label)} format={(v) => v.toFixed(1)} />
              <LineChart title="Median days on market" values={series.map((m) => m.medDom)} labels={series.map((m) => m.label)} format={(v) => String(Math.round(v))} />
              <LineChart title="Sales per month" values={series.map((m) => m.sales)} labels={series.map((m) => m.label)} format={(v) => String(Math.round(v))} />
              <div className="overflow-x-auto md:col-span-2">
                <table className="w-full text-sm"><caption className="sr-only">Monthly figures</caption>
                  <thead className="bg-surface"><tr><th className="px-2 py-1 text-left">Month ending</th><th className="px-2 py-1 text-right">Sales</th><th className="px-2 py-1 text-right">Median price</th><th className="px-2 py-1 text-right">Median $/sqft</th><th className="px-2 py-1 text-right">Median DOM</th><th className="px-2 py-1 text-right">Sale/list</th><th className="px-2 py-1 text-right">Actives</th><th className="px-2 py-1 text-right">Supply</th></tr></thead>
                  <tbody>{series.map((m) => <tr key={m.end} className="border-t border-border"><td className="px-2 py-1">{m.end}</td><td className="px-2 py-1 text-right">{m.sales}</td><td className="px-2 py-1 text-right">{usd(m.medSalePrice)}</td><td className="px-2 py-1 text-right">{usd(m.medPricePerSqft)}</td><td className="px-2 py-1 text-right">{num(m.medDom)}</td><td className="px-2 py-1 text-right">{pc(m.medSaleToList)}</td><td className="px-2 py-1 text-right">{m.actives}</td><td className="px-2 py-1 text-right">{num(m.supply, 1)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          )}

          {tab === 'chars' && (
            <section aria-label="Market characteristics" className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-sm"><caption className="sr-only">Market characteristics</caption>
                <thead className="bg-surface"><tr><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Count</th><th className="px-3 py-2 text-right">Low price</th><th className="px-3 py-2 text-right">Median price</th><th className="px-3 py-2 text-right">High price</th><th className="px-3 py-2 text-right">Average price</th><th className="px-3 py-2 text-right">Median GLA</th><th className="px-3 py-2 text-right">Median lot</th><th className="px-3 py-2 text-right">Median age</th></tr></thead>
                <tbody>{chars.map((c) => <tr key={c.bucket} className="border-t border-border"><th scope="row" className="px-3 py-2 text-left font-normal">{c.label}</th><td className="px-3 py-2 text-right">{c.n}</td><td className="px-3 py-2 text-right">{usd(c.low)}</td><td className="px-3 py-2 text-right">{usd(c.median)}</td><td className="px-3 py-2 text-right">{usd(c.high)}</td><td className="px-3 py-2 text-right">{usd(c.avg)}</td><td className="px-3 py-2 text-right">{num(c.medGla)}</td><td className="px-3 py-2 text-right">{num(c.medLot)}</td><td className="px-3 py-2 text-right">{num(c.medAge)}</td></tr>)}</tbody>
              </table>
              <p className="px-3 py-2 text-xs text-text-muted">Active and pending as of the effective date; sold and off market (expired, withdrawn, terminated) over the 12 months before it.</p>
            </section>
          )}

          {tab === 'hood' && hood && (
            <section aria-label="Neighborhood" className="rounded-md border border-border p-4">
              <p className="mb-3 text-sm text-text-muted">From {hood.n} closed sales in the last 12 months{hoodFile ? ` in the ${hoodFile.name || 'neighborhood'} file` : ' in the first file'}. For the one-unit housing section of the report.</p>
              <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-text-muted">Price, low</dt><dd className="font-semibold">{usd(hood.priceLow)}</dd></div>
                <div><dt className="text-text-muted">Age, low (newest)</dt><dd className="font-semibold">{num(hood.ageLow)} years</dd></div>
                <div><dt className="text-text-muted">Price, high</dt><dd className="font-semibold">{usd(hood.priceHigh)}</dd></div>
                <div><dt className="text-text-muted">Age, high (oldest)</dt><dd className="font-semibold">{num(hood.ageHigh)} years</dd></div>
                <div><dt className="text-text-muted">Price, predominant</dt><dd className="font-semibold">{hood.pricePredominant ? `${usd(hood.pricePredominant.lo)} to ${usd(hood.pricePredominant.hi)} (${hood.pricePredominant.count} sales, ${pc(hood.pricePredominant.share, 0)})` : '-'}</dd></div>
                <div><dt className="text-text-muted">Age, predominant</dt><dd className="font-semibold">{hood.agePredominant ? `${hood.agePredominant.lo} to ${hood.agePredominant.hi} years (${hood.agePredominant.count} sales, ${pc(hood.agePredominant.share, 0)})` : '-'}</dd></div>
              </dl>
            </section>
          )}
        </>
      )}
    </div>
  )
}
