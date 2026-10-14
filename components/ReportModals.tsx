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
import { listEvents, logEvent } from '@/lib/store'
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

type Choice = 'summary' | 'comments' | 'overview'

export function ExportModal({ input, transactional, onClose }: { input: ReportInput; transactional: boolean; onClose: () => void }) {
  const [sel, setSel] = useState<Record<Choice, boolean>>({ summary: true, comments: true, overview: false })
  const [format, setFormat] = useState<'pdf' | 'rtf'>('pdf')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const base = useMemo(() => `${slug(input.session.subject?.address ?? input.session.name)}`, [input])
  const doneCount = Object.values(input.widgets).filter((w) => w.done && w.chosen !== null).length

  async function one(name: string, blocks: ReturnType<typeof buildSummary>, landscape = false) {
    if (format === 'pdf') download(`${name}.pdf`, await toPdf(blocks, landscape), 'application/pdf')
    else download(`${name}.rtf`, toRtf(blocks, landscape), 'application/rtf')
  }
  async function run() {
    setBusy(true); setError('')
    try {
      if (sel.summary) await one(`${base}-adjustments`, buildSummary(input), true)
      if (sel.comments) await one(`${base}-comments`, buildComments(input, transactional))
      if (sel.overview) await one(`${base}-methods`, buildMethodOverview(input))
      void logEvent(input.session.id, 'export.documents', { documents: [sel.summary && 'adjustment summary', sel.comments && 'comments', sel.overview && 'method overview'].filter(Boolean).join(', ') + ` (${format.toUpperCase()})` })
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
      {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    </Modal>
  )
}
