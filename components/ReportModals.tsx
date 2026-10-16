'use client'
import { useMemo, useState } from 'react'
import { defaultCommentOptions, featureComment, type CommentOptions } from '@/lib/comments'
import {
  buildComments, buildFeatureDetails, buildMethodOverview, buildPropertyInfo, buildSettings, buildSummary, propertiesCsv,
  type ReportInput,
} from '@/lib/documents'
import { resolveFeature } from '@/lib/features'
import { download, toPdf, toRtf } from '@/lib/render'
import { eventDetail, eventTitle } from '@/lib/activity'
import { getMarketFiles, listEvents, logEvent } from '@/lib/store'
import { buildMarketDoc } from '@/lib/marketDocs'
import { fillTotalXml, type FillReport } from '@/lib/totalXml'
import { placeComps, type PlaceReport } from '@/lib/totalComps'
import { Button, Modal } from './ui'

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'session'

export function CommentsModal({ input, onClose, onChange, transactional, onTransactional }: {
  input: ReportInput
  onClose: () => void
  onChange: (key: string, o: CommentOptions) => void
  transactional: boolean
  onTransactional: (v: boolean) => void
}) {
  const keys = Object.keys(input.widgets).filter((k) => input.widgets[k].done && input.widgets[k].chosen !== null && resolveFeature(k))
  const opts = (k: string) => input.commentOptions[k] ?? defaultCommentOptions
  return (
    <Modal title="Comments for your report" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <label className="mb-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={transactional} onChange={(e) => onTransactional(e.target.checked)} /> Start with a sentence about the order of transactional adjustments
      </label>
      {keys.length === 0 && <p className="text-text-muted">No feature is marked Done yet. Comments are written for finished features only.</p>}
      <ul className="flex flex-col gap-4">
        {keys.map((k) => {
          const f = resolveFeature(k)!
          const o = opts(k)
          const c = featureComment(f, input.widgets[k], input.results[k] ?? [], o)
          return (
            <li key={k} className="rounded-md border border-border p-3">
              <h3 className="font-semibold">{f.label}</h3>
              <p className="my-2" aria-live="polite">{c?.text}</p>
              <div className="flex flex-wrap items-center gap-4 text-xs">
                <label className="flex items-center gap-1"><input type="checkbox" checked={o.range} onChange={(e) => onChange(k, { ...o, range: e.target.checked })} /> Include the range of results</label>
                <label className="flex items-center gap-1"><input type="checkbox" checked={o.methods} onChange={(e) => onChange(k, { ...o, methods: e.target.checked })} /> Include the methods</label>
                <Button variant="link" onClick={() => { for (const other of keys) onChange(other, { ...opts(other), range: o.range, methods: o.methods }) }}>Apply these two choices to all</Button>
              </div>
              <label className="mt-2 flex flex-col gap-1 text-xs text-text-muted">Add your own sentence
                <textarea className="min-h-16 rounded-md border border-border-input p-2 text-sm text-text" value={o.extra} onChange={(e) => onChange(k, { ...o, extra: e.target.value })} />
              </label>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}

type Choice = 'summary' | 'comments' | 'overview' | 'market'

export function ExportModal({ input, transactional, onClose }: { input: ReportInput; transactional: boolean; onClose: () => void }) {
  const [sel, setSel] = useState<Record<Choice, boolean>>({ summary: true, comments: true, overview: false, market: false })
  const [format, setFormat] = useState<'pdf' | 'rtf'>('pdf')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const base = useMemo(() => `${slug(input.session.subject?.address ?? input.session.name)}`, [input])
  const doneCount = Object.values(input.widgets).filter((w) => w.done && w.chosen !== null).length

  async function one(name: string, blocks: ReturnType<typeof buildSummary>, landscape = false) {
    if (format === 'pdf') download(`${name}.pdf`, await toPdf(blocks, landscape), 'application/pdf')
    else download(`${name}.rtf`, toRtf(blocks, landscape), 'application/rtf')
  }
  async function marketBlocks() {
    const files = await getMarketFiles(input.session.id).catch(() => [])
    const comp = files.find((f) => f.slot === 1)
    if (!comp?.listings.length) return null
    return buildMarketDoc(comp.listings, input.session.effectiveDate, input.session.subject?.address ?? input.session.name, comp.notes, input.session.mls, files.find((f) => f.slot === 2)?.listings)
  }
  async function run() {
    setBusy(true); setError('')
    try {
      if (sel.summary) await one(`${base}-adjustments`, buildSummary(input), true)
      if (sel.comments) await one(`${base}-comments`, buildComments(input, transactional))
      if (sel.overview) await one(`${base}-methods`, buildMethodOverview(input))
      if (sel.market) {
        const m = await marketBlocks()
        if (m) await one(`${base}-market-conditions`, m)
        else setError('Load a market file first (Market analysis on the results page).')
      }
      void logEvent(input.session.id, 'export.documents', { documents: [sel.summary && 'adjustment summary', sel.comments && 'comments', sel.overview && 'method overview', sel.market && 'market conditions'].filter(Boolean).join(', ') + ` (${format.toUpperCase()})` })
    } catch (e) { setError(e instanceof Error ? e.message : 'The export failed.') } finally { setBusy(false) }
  }
  async function workfile() {
    setBusy(true); setError('')
    try {
      const { zipSync, strToU8 } = await import('fflate')
      const files: Record<string, Uint8Array> = {}
      const add = async (path: string, blocks: ReturnType<typeof buildSummary>, landscape = false) => {
        files[`${path}.pdf`] = await toPdf(blocks, landscape)
        files[`${path}.rtf`] = strToU8(toRtf(blocks, landscape))
      }
      await add('Primary-Adjustment-Summary', buildSummary(input), true)
      await add('Adjustment-Comments', buildComments(input, transactional))
      await add('Adjustment-Method-Overview', buildMethodOverview(input))
      await add('Settings', buildSettings(input))
      await add('Property-Information', buildPropertyInfo(input))
      try {
        const m = await marketBlocks()
        if (m) await add('Market-Conditions', m)
      } catch { /* optional */ }
      try {
        const events = (await listEvents(input.session.id)).slice().reverse()
        await add('Activity-Log', [
          { kind: 'title', text: 'Activity log' }, { kind: 'p', text: `${input.session.subject?.address ?? input.session.name}. Every change made in this session, oldest first.` },
          { kind: 'table', head: ['Time', 'Event', 'Details'], rows: events.map((e) => [new Date(e.ts).toLocaleString('en-US'), eventTitle(e.type), eventDetail(e.type, e.detail)]) },
        ], true)
      } catch { /* the workfile is still useful without it */ }
      for (const k of Object.keys(input.widgets)) if (input.widgets[k].chosen !== null && resolveFeature(k)) await add(`Details/${slug(resolveFeature(k)!.label)}`, buildFeatureDetails(input, k))
      files['Data/properties-used.csv'] = strToU8(propertiesCsv(input))
      download(`${base}-workfile.zip`, zipSync(files), 'application/zip')
      void logEvent(input.session.id, 'export.workfile', {})
    } catch (e) { setError(e instanceof Error ? e.message : 'The workfile could not be built.') } finally { setBusy(false) }
  }

  const [totalOpen, setTotalOpen] = useState(false)
  const box = (k: Choice, label: string) => (
    <label className="flex items-center gap-2"><input type="checkbox" checked={sel[k]} onChange={(e) => setSel({ ...sel, [k]: e.target.checked })} /> {label}</label>
  )
  return (
    <Modal title="Export" onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {doneCount === 0 && <p className="mb-3 rounded-md bg-warning-bg p-2 text-warning" role="status">No feature is marked Done yet, so the documents will be mostly empty.</p>}
      <fieldset className="mb-4 flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Documents for your appraisal report</legend>
        {box('summary', 'Primary adjustment summary (results by method)')}
        {box('comments', 'Adjustment comments')}
        {box('overview', 'Method overview')}
        {box('market', 'Market conditions (1004MC)')}
        <div className="mt-2 flex items-center gap-4">
          <label className="flex items-center gap-1"><input type="radio" name="fmt" checked={format === 'pdf'} onChange={() => setFormat('pdf')} /> PDF</label>
          <label className="flex items-center gap-1"><input type="radio" name="fmt" checked={format === 'rtf'} onChange={() => setFormat('rtf')} /> RTF (to copy and paste)</label>
          <Button loading={busy} disabled={!Object.values(sel).some(Boolean)} onClick={() => void run()}>Download</Button>
        </div>
      </fieldset>
      <div className="border-t border-border pt-3">
        <p className="mb-2 font-semibold">Digital workfile</p>
        <p className="mb-2 text-xs text-text-muted">One zip with every document above in PDF and RTF, a details page for each feature, your settings, what was left out of the data, and the sales used as a CSV.</p>
        <Button variant="secondary" loading={busy} onClick={() => void workfile()}>Download the workfile (zip)</Button>
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <p className="mb-2 font-semibold">a la mode TOTAL</p>
        <p className="mb-2 text-xs text-text-muted">Put sales from your analysis into a TOTAL report as comps, with your chosen adjustments and the 1004MC figures. Nothing is sent anywhere; the file is read and rewritten in your browser.</p>
        <Button variant="secondary" onClick={() => setTotalOpen((v) => !v)}>{totalOpen ? 'Hide' : 'Fill a TOTAL report'}</Button>
        {totalOpen && <TotalFill input={input} base={base} />}
      </div>
      {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    </Modal>
  )
}

function TotalFill({ input, base }: { input: ReportInput; base: string }) {
  const [roundTo, setRoundTo] = useState(50)
  const [withMarket, setWithMarket] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [report, setReport] = useState<FillReport | null>(null)
  const [placed, setPlaced] = useState<PlaceReport | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [slot, setSlot] = useState(input.session.datasets.find((d) => d.properties.length)?.slot ?? 1)
  const [filter, setFilter] = useState('')
  const sales = useMemo(() => {
    const d = input.session.datasets.find((x) => x.slot === slot)
    const q = filter.trim().toLowerCase()
    return (d?.properties ?? []).filter((p) => !p.deleted && (!q || p.id.toLowerCase().includes(q) || (p.text?.address ?? '').toLowerCase().includes(q))).slice().sort((a, b) => b.saleDate.localeCompare(a.saleDate))
  }, [input.session.datasets, slot, filter])
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 12 ? cur : [...cur, id]))
  const keys = Object.keys(input.widgets).filter((k) => input.widgets[k].done && input.widgets[k].chosen !== null && resolveFeature(k))

  async function onFile(file: File | undefined) {
    if (!file) return
    setBusy(true); setError(''); setReport(null); setPlaced(null)
    try {
      let xml = await file.text()
      const all = new Map(input.session.datasets.flatMap((d) => d.properties).map((p) => [p.id, p]))
      if (picked.length) {
        const pl = placeComps(xml, picked.map((id) => all.get(id)!).filter(Boolean), { mlsName: input.session.mls || 'MLS', effectiveDate: input.session.effectiveDate, state: 'TX' })
        xml = pl.xml
        setPlaced(pl)
      }
      const rates: Record<string, number> = {}
      for (const k of keys) rates[k] = input.widgets[k].chosen as number
      const sub = input.session.subject
      const subject: Record<string, number | null> = sub ? { gla: sub.gla, lot_size: sub.lot_size, baths_full: sub.baths_full, baths_half: sub.baths_half, stories: sub.stories, garage: sub.garage } : {}
      for (const k of keys) if (input.widgets[k].subject !== undefined && input.widgets[k].subject !== null) subject[k] = input.widgets[k].subject as number
      const comps = new Map<string, Record<string, number | null>>()
      for (const d of input.prepared) for (const p of d.props) if (!comps.has(p.id)) comps.set(p.id, p.values)
      let market = null
      if (withMarket) {
        const files = await getMarketFiles(input.session.id).catch(() => [])
        const f = files.find((x) => x.slot === 1)
        if (f?.listings.length) market = { listings: f.listings, effective: input.session.effectiveDate, source: String(f.notes.source || input.session.mls || 'The MLS'), notes: f.notes }
      }
      const out = fillTotalXml({ xml, rates, subject, comps, options: { roundTo, dropEmbeddedPdf: true, market } })
      setReport(out)
      download(`${file.name.replace(/\.xml$/i, '')}-adjusted.xml`, out.xml, 'application/xml')
      void logEvent(input.session.id, 'export.documents', { documents: `TOTAL report (XML)${picked.length ? `, ${picked.length} comps placed` : ''}` })
    } catch (e) { setError(e instanceof Error ? e.message : 'The file could not be filled.') } finally { setBusy(false) }
  }

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-md border border-border p-3 text-sm">
      <ol className="list-decimal pl-5 text-xs text-text-muted">
        <li>In TOTAL, start the report (subject entered, and at least one comparable column in the grid), then save it as XML (UAD).</li>
        <li>Choose that file below. The adjusted copy downloads; your original is not touched.</li>
        <li>In TOTAL, use File &gt; Open UAD XML on the copy and review it.</li>
      </ol>
      <fieldset className="flex flex-col gap-2 rounded-md border border-border p-2">
        <legend className="px-1 font-semibold">1. Sales to put in the grid as comps (optional, up to 12, in the order you click)</legend>
        <div className="flex flex-wrap items-center gap-2">
          <select className="rounded-md border border-border-input p-1" aria-label="Dataset" value={slot} onChange={(e) => setSlot(Number(e.target.value))}>
            {input.session.datasets.filter((d) => d.properties.length).map((d) => <option key={d.slot} value={d.slot}>{d.name}</option>)}
          </select>
          <input className="rounded-md border border-border-input p-1" placeholder="Find by address or MLS number" aria-label="Find a sale" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <span className="text-xs text-text-muted">{picked.length} chosen</span>
          {picked.length > 0 && <Button variant="link" onClick={() => setPicked([])}>Clear</Button>}
        </div>
        <ul className="max-h-48 overflow-auto text-xs">
          {sales.slice(0, 200).map((p) => (
            <li key={p.id}>
              <label className="flex items-center gap-2 py-0.5">
                <input type="checkbox" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} />
                <span className="w-6 text-right text-text-muted">{picked.includes(p.id) ? picked.indexOf(p.id) + 1 : ''}</span>
                <span>{p.text?.address || <em>no address on file</em>}</span>
                <span className="text-text-muted">MLS {p.id} · ${p.salePrice.toLocaleString('en-US')} · {p.saleDate} · {p.values.gla ?? '?'} sf</span>
              </label>
            </li>
          ))}
        </ul>
        {sales.length > 0 && sales.every((p) => !p.text?.address) && <p className="text-xs text-warning">These sales have no street addresses. Load the MLS file again (Datasets) so addresses are kept.</p>}
      </fieldset>
      <p className="text-xs">2. {keys.length} finished feature{keys.length === 1 ? '' : 's'} will be written: {keys.map((k) => resolveFeature(k)!.label).join(', ') || 'none yet'}.</p>
      <label className="flex items-center gap-2">Round each adjustment to the nearest
        <select className="rounded-md border border-border-input p-1" value={roundTo} onChange={(e) => setRoundTo(Number(e.target.value))}>
          {[1, 5, 10, 50, 100].map((v) => <option key={v} value={v}>${v}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={withMarket} onChange={(e) => setWithMarket(e.target.checked)} /> Also fill the 1004MC figures and market wording (needs a market file)</label>
      <label className="flex flex-col gap-1">TOTAL report saved as XML
        <input type="file" accept=".xml,text/xml,application/xml" disabled={busy || (keys.length === 0 && picked.length === 0)} onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {error && <p role="alert" className="text-danger">{error}</p>}
      {placed && (
        <div aria-live="polite" className="text-xs">
          <p className="font-semibold">Comps placed</p>
          <ul className="list-disc pl-5">{placed.placed.map((c) => <li key={c.seq}>Comp {c.seq}: {c.address || 'no address'} (MLS {c.id}){c.distance ? `, ${c.distance}` : ''}{c.created ? ', new column' : ', existing column updated'}</li>)}</ul>
          {placed.warnings.length > 0 && <ul className="mt-1 list-disc pl-5 text-warning">{placed.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
      )}
      {report && (
        <div aria-live="polite">
          <table className="w-full text-xs">
            <thead><tr className="text-left"><th>Comp</th><th>MLS</th><th>Net adjustment</th><th>Adjusted price</th></tr></thead>
            <tbody>
              {report.comps.map((c) => (
                <tr key={c.seq}><td>{c.seq}. {c.address}</td><td>{c.mls}{c.matched ? '' : ' (not in session)'}</td><td>{c.total === null ? '-' : c.total.toLocaleString('en-US')}</td><td>{c.adjusted === null ? '-' : c.adjusted.toLocaleString('en-US')}</td></tr>
              ))}
            </tbody>
          </table>
          {report.marketUpdated && <p className="mt-1 text-xs">1004MC figures and wording were updated.</p>}
          {report.removedPdf && <p className="mt-1 text-xs">The copy of the old PDF stored inside the file was removed; TOTAL makes a new one.</p>}
          {report.warnings.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-warning">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>}
        </div>
      )}
    </div>
  )
}
