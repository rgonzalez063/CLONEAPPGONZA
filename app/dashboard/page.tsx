'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Bars, Panel, Scatter, Tile } from '@/components/charts'
import { Button } from '@/components/ui'
import { mc1004 } from '@/engines'
import { computeFeature, prepareDatasets, type DatasetResults } from '@/lib/analysis'
import { eventDetail, eventTitle } from '@/lib/activity'
import { mostSimilar, propertyMetrics, sessionMetrics } from '@/lib/dashboard'
import { resolveFeature } from '@/lib/features'
import { getMarketFiles, getSession, listSessions, type MarketFile, type Session, type SessionSummary } from '@/lib/store'

interface Summary {
  totals: { sessions: number; favorites: number; createdLast30Days: number; sales: number; marketListings: number; templates: number; lastActive: string | null }
  sessionsByMonth: { month: string; count: number }[]
  zips: { zip: string; count: number }[]
  adjustments: { feature: string; sessions: number; median: number; low: number; high: number }[]
  activity: { type: string; count: number }[]
  recent: { id: number; ts: string; type: string; detail: Record<string, unknown>; sessionId: string; sessionName: string }[]
}

const usd = (v: number | null | undefined) => (v === null || v === undefined ? '-' : `${v < 0 ? '-' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`)
const rate = (v: number) => (Math.abs(v) >= 100 ? usd(v) : `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`)
const n0 = (v: number | null | undefined) => (v === null || v === undefined ? '-' : Math.round(v).toLocaleString('en-US'))
const pct = (v: number | null | undefined, d = 1) => (v === null || v === undefined ? '-' : `${v.toFixed(d)}%`)
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US') : 'never')
const label = (key: string) => resolveFeature(key)?.label ?? key

async function fetchSummary(): Promise<Summary> {
  const r = await fetch('/api/dashboard', { credentials: 'same-origin' })
  if (r.status === 401) { window.location.href = '/login?next=/dashboard'; throw new Error('Please sign in.') }
  if (!r.ok) throw new Error('Could not load the dashboard.')
  return r.json()
}

function Section({ id, title, intro, children }: { id: string; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mb-10">
      <h2 id={id} className="text-lg font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-text-muted">{intro}</p>
      {children}
    </section>
  )
}

export default function DashboardPage() {
  const [sum, setSum] = useState<Summary | null>(null)
  const [list, setList] = useState<SessionSummary[]>([])
  const [error, setError] = useState('')
  const [id, setId] = useState('')
  const [session, setSession] = useState<Session | null>(null)
  const [market, setMarket] = useState<MarketFile | null>(null)
  const [loading, setLoading] = useState(false)
  const [slot, setSlot] = useState(0)

  useEffect(() => {
    fetchSummary().then(setSum).catch((e: Error) => setError(e.message))
    listSessions().then((l) => { setList(l); if (l[0]) setId(l[0].id) }).catch(() => undefined)
  }, [])
  useEffect(() => {
    if (!id) { setSession(null); return }
    setLoading(true); setSlot(0)
    Promise.all([getSession(id), getMarketFiles(id).catch(() => [])])
      .then(([s, files]) => { setSession(s); setMarket(files.find((f) => f.slot === 1) ?? null) })
      .catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [id])

  const prepared = useMemo(() => (session ? prepareDatasets(session) : []), [session])
  const computed = useMemo(() => {
    if (!session?.subject) return {} as Record<string, DatasetResults[]>
    return Object.fromEntries(Object.keys(session.widgets).map((k) => [k, computeFeature(session, k, prepared)]))
  }, [session, prepared])
  const sm = useMemo(() => (session ? sessionMetrics(session, prepared, computed) : null), [session, prepared, computed])
  const pm = useMemo(() => (session ? propertyMetrics(session, prepared) : []), [session, prepared])
  const similar = useMemo(() => (session ? mostSimilar(session, prepared) : []), [session, prepared])
  const mc = useMemo(() => (market?.listings.length && session ? mc1004(market.listings, session.effectiveDate) : null), [market, session])

  if (error && !sum) return <div className="p-8"><p role="alert" className="text-danger">{error}</p><Button className="mt-3" onClick={() => window.location.reload()}>Try again</Button></div>
  if (!sum) return <p className="p-8 text-text-muted">Loading…</p>
  const t = sum.totals
  const cur = pm[slot] ?? pm[0]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-1 text-xl font-bold">Dashboard</h1>
      <nav aria-label="Dashboard sections" className="mb-6 flex gap-4 text-sm"><a className="text-accent" href="#general">General</a><a className="text-accent" href="#session">This session</a><a className="text-accent" href="#property">Property data</a></nav>

      <Section id="general" title="General" intro="Your work across every session. Only your own sessions are counted.">
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          <Tile label="Sessions" value={t.sessions} sub={`${t.favorites} favorite${t.favorites === 1 ? '' : 's'}`} />
          <Tile label="Started, last 30 days" value={t.createdLast30Days} />
          <Tile label="Sales on file" value={n0(t.sales)} />
          <Tile label="Market listings" value={n0(t.marketListings)} />
          <Tile label="Templates" value={t.templates} />
          <Tile label="Last active" value={<span className="text-base">{day(t.lastActive)}</span>} />
          <Tile label="Adjustments decided" value={sum.adjustments.reduce((a, x) => a + x.sessions, 0)} sub="across all sessions" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Bars title="Sessions started per month" note="Last 12 months" items={sum.sessionsByMonth.map((m) => ({ label: m.month.slice(2), value: m.count }))} format={(v) => String(v)} />
          <Bars title="What you did, last 30 days" note="Number of recorded actions by kind" items={sum.activity.map((a) => ({ label: eventTitle(a.type), value: a.count }))} format={(v) => String(v)} color={1} />
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Panel title="Adjustments you decided" note="Done adjustments across all your sessions">
            {sum.adjustments.length === 0 ? <p className="text-xs text-text-muted">Mark an adjustment done to see it here.</p> : (
              <table className="w-full text-sm"><thead><tr className="text-left text-xs text-text-muted"><th className="py-1">Feature</th><th className="text-right">Sessions</th><th className="text-right">Median</th><th className="text-right">Range</th></tr></thead>
                <tbody>{sum.adjustments.map((a) => <tr key={a.feature} className="border-t border-border"><td className="py-1">{label(a.feature)}</td><td className="text-right">{a.sessions}</td><td className="text-right tabular-nums">{rate(a.median)}</td><td className="text-right tabular-nums">{rate(a.low)} to {rate(a.high)}</td></tr>)}</tbody></table>
            )}
          </Panel>
          <div className="flex flex-col gap-4">
            <Panel title="Where you work" note="Subject zip codes">
              {sum.zips.length === 0 ? <p className="text-xs text-text-muted">Enter a zip code on a subject to see it here.</p> : <ul className="text-sm">{sum.zips.map((z) => <li key={z.zip} className="flex justify-between border-t border-border py-1 first:border-0"><span>{z.zip}</span><span className="tabular-nums">{z.count} session{z.count === 1 ? '' : 's'}</span></li>)}</ul>}
            </Panel>
            <Panel title="Latest activity">
              {sum.recent.length === 0 ? <p className="text-xs text-text-muted">Nothing yet.</p> : (
                <ul className="text-sm">{sum.recent.map((r) => (
                  <li key={r.id} className="border-t border-border py-1 first:border-0"><Link className="text-accent" href={`/session/${r.sessionId}/results`}>{r.sessionName}</Link>: {eventTitle(r.type)} <span className="text-text-muted">{eventDetail(r.type, r.detail)}</span> <span className="text-xs text-text-muted">{new Date(r.ts).toLocaleString('en-US')}</span></li>
                ))}</ul>
              )}
            </Panel>
          </div>
        </div>
      </Section>

      <Section id="session" title="This session" intro="Where the adjustments stand, how much the methods agree, and how sound the data is.">
        {list.length === 0 ? <p className="text-text-muted">No sessions yet. <Link className="text-accent" href="/">Start one</Link>.</p> : (
          <>
            <label className="mb-3 flex items-center gap-2 text-sm">Session
              <select aria-label="Session" className="h-9 rounded-sm border border-border-input bg-surface px-2" value={id} onChange={(e) => setId(e.target.value)}>
                {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {session && <Link className="text-accent" href={`/session/${session.id}/results`}>Open it</Link>}
            </label>
            {loading || !session || !sm ? <p className="text-text-muted">Loading…</p> : (
              <>
                <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Tile label="Adjustments done" value={`${sm.done} of ${sm.total}`} sub={sm.total ? `${Math.round((100 * sm.done) / sm.total)}% finished` : 'No features added'} />
                  <Tile label="Sales used" value={n0(sm.data.datasets.reduce((a, d) => a + d.kept, 0))} sub={`${n0(sm.data.datasets.reduce((a, d) => a + d.removed, 0))} set aside by the transactional filters`} />
                  <Tile label="Time trend" value={sm.data.trend[0]?.changePerMonthPct !== null && sm.data.trend[0]?.changePerMonthPct !== undefined ? `${pct(sm.data.trend[0].changePerMonthPct, 2)} / mo` : sm.data.trend[0]?.model ?? '-'} sub={sm.data.trend[0] ? `${sm.data.trend[0].name}: ${sm.data.trend[0].model}${sm.data.trend[0].r2 !== null ? `, r² ${sm.data.trend[0].r2.toFixed(2)}` : ''}` : undefined} />
                  <Tile label="Sales after the effective date" value={n0(sm.data.datasets.reduce((a, d) => a + d.afterEffective, 0))} sub="left out of the analysis" />
                </div>
                <Panel title="Adjustments and how much the methods agree" note="The bar is the range of the results the methods gave; the mark is your chosen value.">
                  {sm.features.length === 0 ? <p className="text-xs text-text-muted">No features yet.</p> : (
                    <table className="w-full text-sm"><thead><tr className="text-left text-xs text-text-muted"><th className="py-1">Feature</th><th className="text-right">Chosen</th><th className="text-right">Methods</th><th className="text-right">Low to high</th><th className="w-48 px-2">Range</th><th>Status</th></tr></thead>
                      <tbody>{sm.features.map((f) => {
                        const lo = f.low, hi = f.high
                        const span = lo !== null && hi !== null ? Math.max(hi - lo, 1e-9) : 1
                        const at = f.chosen !== null && lo !== null ? Math.min(1, Math.max(0, (f.chosen - lo) / span)) : null
                        return (
                          <tr key={f.key} className="border-t border-border">
                            <td className="py-1">{f.label}</td><td className="text-right tabular-nums">{f.chosen === null ? '-' : rate(f.chosen)}</td><td className="text-right">{f.results}</td>
                            <td className="text-right tabular-nums">{lo === null || hi === null ? '-' : `${rate(lo)} to ${rate(hi)}`}</td>
                            <td className="px-2"><svg width="100%" height="14" role="img" aria-label={f.chosen === null ? 'No value chosen' : f.insideRange ? 'Chosen value is inside the range' : 'Chosen value is outside the range'}>
                              <rect x="0" y="5" width="100%" height="4" rx="2" fill="var(--color-chart-grid)" opacity="0.35" />{at !== null && <rect x={`calc(${at * 100}% - 2px)`} y="1" width="4" height="12" rx="2" fill="var(--color-dataset-1)" />}</svg></td>
                            <td>{f.chosen === null ? <span className="text-text-muted">{f.done ? 'Done' : 'Open'}</span> : f.insideRange === false ? <span className="text-warning">Outside range</span> : f.done ? 'Done' : 'Chosen'}</td>
                          </tr>
                        )
                      })}</tbody></table>
                  )}
                </Panel>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Panel title="Data" note="Sales loaded and what was set aside">
                    <table className="w-full text-sm"><thead><tr className="text-left text-xs text-text-muted"><th className="py-1">Dataset</th><th className="text-right">Loaded</th><th className="text-right">Used</th><th className="text-right">Set aside</th></tr></thead>
                      <tbody>{sm.data.datasets.map((d) => <tr key={d.name} className="border-t border-border"><td className="py-1">{d.name}</td><td className="text-right">{d.loaded}</td><td className="text-right">{d.kept}</td><td className="text-right">{d.removed}</td></tr>)}</tbody></table>
                    {sm.data.datasets.some((d) => d.kept < 5) && <p className="mt-2 text-xs text-warning" role="note">A dataset with fewer than five sales gives results that move a lot with one sale.</p>}
                  </Panel>
                  <Panel title="Market snapshot" note={market ? 'From the market file, current 3 months' : undefined}>
                    {mc ? (
                      <dl className="grid grid-cols-2 gap-2 text-sm">
                        <div><dt className="text-xs text-text-muted">Sales</dt><dd className="font-semibold">{mc[2].sales}</dd></div><div><dt className="text-xs text-text-muted">Months of supply</dt><dd className="font-semibold">{mc[2].monthsSupply === null ? '-' : mc[2].monthsSupply.toFixed(1)}</dd></div>
                        <div><dt className="text-xs text-text-muted">Median sale price</dt><dd className="font-semibold">{usd(mc[2].medSalePrice)}</dd></div><div><dt className="text-xs text-text-muted">Median days on market</dt><dd className="font-semibold">{n0(mc[2].medDom)}</dd></div>
                        <div className="col-span-2"><Link className="text-accent text-xs" href={`/session/${session.id}/market`}>Open the market analysis</Link></div>
                      </dl>
                    ) : <p className="text-xs text-text-muted">No market file for this session. <Link className="text-accent" href={`/session/${session.id}/market`}>Load one</Link>.</p>}
                  </Panel>
                </div>
              </>
            )}
          </>
        )}
      </Section>

      <Section id="property" title="Property data" intro="The sales in this session: prices after the transactional adjustments, sizes, ages and timing.">
        {!session || pm.length === 0 ? <p className="text-text-muted">Load sales into a session to see their figures.</p> : (
          <>
            <Panel title="Datasets" note="Prices are after financing, concessions and time adjustments">
              <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-text-muted"><th className="py-1">Dataset</th><th className="text-right">Sales</th><th className="text-right">Median price</th><th className="text-right">Average</th><th className="text-right">Low to high</th><th className="text-right">Median $/sqft</th><th className="text-right">Median GLA</th><th className="text-right">Median lot</th><th className="text-right">Median age</th><th className="text-right">With concessions</th></tr></thead>
                <tbody>{pm.map((d) => <tr key={d.slot} className="border-t border-border"><td className="py-1">{d.name}</td><td className="text-right">{d.n}</td><td className="text-right tabular-nums">{usd(d.price?.median)}</td><td className="text-right tabular-nums">{usd(d.price?.mean)}</td><td className="text-right tabular-nums">{d.price ? `${usd(d.price.min)} to ${usd(d.price.max)}` : '-'}</td><td className="text-right tabular-nums">{d.perSqft ? `$${d.perSqft.median.toFixed(0)}` : '-'}</td><td className="text-right tabular-nums">{n0(d.gla?.median)}</td><td className="text-right tabular-nums">{n0(d.lot?.median)}</td><td className="text-right tabular-nums">{n0(d.age?.median)}</td><td className="text-right">{pct(d.concessionPct, 0)}</td></tr>)}</tbody></table></div>
            </Panel>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Scatter title="Price and size" note="The dashed line is the subject's GLA" series={pm.map((d) => ({ name: d.name, points: d.points }))} subjectX={session.subject?.gla ?? null} xFormat={n0} yFormat={usd} xLabel="GLA (sqft)" />
              <div>
                {pm.length > 1 && <div role="radiogroup" aria-label="Dataset for the charts" className="mb-2 flex gap-3 text-sm">{pm.map((d, i) => <label key={d.slot} className="flex items-center gap-1"><input type="radio" name="ds" checked={slot === i} onChange={() => setSlot(i)} />{d.name}</label>)}</div>}
                {cur && <Bars title={`Sale prices, ${cur.name}`} note="How many sales fall in each price band" items={cur.priceBins.map((b) => ({ label: `${Math.round(b.lo / 1000)}k`, value: b.count, hint: `${usd(b.lo)} to ${usd(b.hi)}` }))} format={(v) => String(v)} />}
              </div>
            </div>
            {cur && (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <Bars title={`Sales per month, ${cur.name}`} items={cur.byMonth.map((m) => ({ label: m.month.slice(2), value: m.sales, hint: `median ${usd(m.medianPrice)}` }))} format={(v) => String(v)} color={1} />
                <Bars title={`Median sale price by month, ${cur.name}`} items={cur.byMonth.map((m) => ({ label: m.month.slice(2), value: m.medianPrice ?? 0 }))} format={usd} color={2} />
                <Bars title="Bedrooms" items={cur.beds.map((b) => ({ label: String(b.value), value: b.count }))} format={(v) => String(v)} />
                <Bars title="Full baths" items={cur.bathsFull.map((b) => ({ label: String(b.value), value: b.count }))} format={(v) => String(v)} />
              </div>
            )}
            <Panel title="Sales most like the subject" note="Ranked by closeness in GLA and lot size. A way to look at the data, not an adjustment method.">
              {similar.length === 0 ? <p className="text-xs text-text-muted">Enter the subject&apos;s GLA to see this.</p> : (
                <table className="w-full text-sm"><thead><tr className="text-left text-xs text-text-muted"><th className="py-1">Sale</th><th>Dataset</th><th className="text-right">Price</th><th className="text-right">GLA</th><th className="text-right">Lot</th><th className="text-right">Age</th><th className="text-right">$/sqft</th></tr></thead>
                  <tbody>{similar.map((s) => <tr key={`${s.dataset}-${s.id}`} className="border-t border-border"><td className="py-1">{s.id}</td><td>{s.dataset}</td><td className="text-right tabular-nums">{usd(s.price)}</td><td className="text-right tabular-nums">{n0(s.gla)}</td><td className="text-right tabular-nums">{n0(s.lot)}</td><td className="text-right tabular-nums">{n0(s.age)}</td><td className="text-right tabular-nums">{s.perSqft ? `$${s.perSqft.toFixed(0)}` : '-'}</td></tr>)}</tbody></table>
              )}
            </Panel>
          </>
        )}
      </Section>
    </div>
  )
}
