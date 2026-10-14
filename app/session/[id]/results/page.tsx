'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { FeatureWidget } from '@/components/FeatureWidget'
import { Button, Modal, TextInput } from '@/components/ui'
import { CommentsModal, ExportModal } from '@/components/ReportModals'
import { PairedSettingsModal } from '@/components/PairedSettingsModal'
import type { ReportInput } from '@/lib/documents'
import { defaultCommentOptions } from '@/lib/comments'
import { computeFeature, defaultWidget, prepareDatasets, subjectValues } from '@/lib/analysis'
import { defaultTransactional, type TransactionalSettings } from '@/lib/transactional'
import { FEATURE_ORDER, PLAIN_MENU, FEATURES, compareKey, groupKey, groupMenu, resolveFeature } from '@/lib/features'
import { getSession, saveSession, type Session, type Subject, type WidgetState } from '@/lib/store'

const blank: Subject = { address: '', zip: '', gla: null, lot_size: null, baths_full: null, baths_half: null, stories: null, garage: null }

function SubjectModal({ initial, onDone, onCancel }: { initial: Subject; onDone: (s: Subject) => void; onCancel: () => void }) {
  const [v, setV] = useState<Subject>(initial)
  const num = (k: keyof Subject) => ({ value: (v[k] as number | null) ?? '', onChange: (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value === '' ? null : Number(e.target.value) }) })
  const errors = { address: v.address.trim() ? undefined : 'Enter the subject address.', gla: v.gla && v.gla > 0 ? undefined : 'Enter the GLA.' }
  const ok = !errors.address && !errors.gla
  return (
    <Modal title="About the subject property" onClose={onCancel}
      footer={<><Button variant="danger" onClick={onCancel}>Cancel</Button><Button disabled={!ok} onClick={() => onDone(v)}>Done</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><TextInput label="Address" value={v.address} error={errors.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></div>
        <TextInput label="Zip code" value={v.zip} onChange={(e) => setV({ ...v, zip: e.target.value })} />
        <TextInput label="GLA (sqft)" type="number" error={errors.gla} {...num('gla')} />
        <TextInput label="Lot size (sqft)" type="number" {...num('lot_size')} />
        <TextInput label="Baths: full" type="number" {...num('baths_full')} />
        <TextInput label="Baths: half" type="number" {...num('baths_half')} />
        <TextInput label="Stories" type="number" {...num('stories')} />
        <TextInput label="Garage spaces" type="number" {...num('garage')} />
      </div>
    </Modal>
  )
}

function AddFeatureModal({ existing, onAdd, onClose }: { existing: string[]; onAdd: (key: string) => void; onClose: () => void }) {
  const groups = groupMenu()
  const [pick, setPick] = useState('')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const group = groups.find((g) => g.id === pick)
  const plain = PLAIN_MENU.filter((k) => !existing.includes(k))
  const key = group ? (a && b && a !== b ? compareKey(group.id, a, b) : a && !b ? groupKey(group.id, a) : '') : pick
  const valid = key && resolveFeature(key) && !existing.includes(key)
  return (
    <Modal title="Add a feature" onClose={onClose}
      footer={<><Button variant="danger" onClick={onClose}>Cancel</Button><Button disabled={!valid} onClick={() => onAdd(key)}>Add</Button></>}>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-muted">Feature
          <select className="h-10 rounded-md border border-border-input px-3 text-sm text-text" value={pick} onChange={(e) => { setPick(e.target.value); setA(''); setB('') }}>
            <option value="">Choose a feature…</option>
            <optgroup label="Single features">{plain.map((k) => <option key={k} value={k}>{FEATURES[k].label}</option>)}</optgroup>
            <optgroup label="Groups of options">{groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</optgroup>
          </select>
        </label>
        {group && (
          <>
            <label className="flex flex-col gap-1 text-xs text-text-muted">Option
              <select className="h-10 rounded-md border border-border-input px-3 text-sm text-text" value={a} onChange={(e) => setA(e.target.value)}>
                <option value="">Choose an option…</option>{group.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-text-muted">Compare with (optional)
              <select className="h-10 rounded-md border border-border-input px-3 text-sm text-text" value={b} onChange={(e) => setB(e.target.value)}>
                <option value="">Nothing: has it or not</option>{group.options.filter((o) => o !== a).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </label>
          </>
        )}
        <p className="text-xs text-text-muted">The results table shows how many properties each method could use. An option that few properties have cannot give a result.</p>
      </div>
    </Modal>
  )
}

function TransactionalPanel({ settings, prepared, onChange }: { settings: TransactionalSettings; prepared: ReturnType<typeof prepareDatasets>; onChange: (t: TransactionalSettings) => void }) {
  const box = (k: 'removeLeasehold' | 'removeNonCash' | 'removeREO' | 'removeShortSale' | 'deductConcessions', label: string) => (
    <label className="flex items-center gap-2"><input type="checkbox" checked={settings[k]} onChange={(e) => onChange({ ...settings, [k]: e.target.checked })} /> {label}</label>
  )
  return (
    <details className="mb-3 rounded-md border border-border p-3">
      <summary className="cursor-pointer font-semibold">Transactional adjustments (done before any feature adjustment)</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {box('removeLeasehold', '1. Remove leasehold sales')}
        {box('removeNonCash', '2. Remove owner or seller financed sales')}
        {box('removeREO', '3. Remove REO sales')}
        {box('removeShortSale', '3. Remove short sales')}
        {box('deductConcessions', '4. Deduct seller concessions from the price')}
        <label className="flex items-center gap-2">5. Market conditions by
          <select aria-label="Time basis" className="rounded-sm border border-border-input px-1" value={settings.timeBasis} onChange={(e) => onChange({ ...settings, timeBasis: e.target.value as 'contract' | 'sale' })}>
            <option value="contract">contract date</option><option value="sale">sale date</option>
          </select>
          <select aria-label="Time trend" className="rounded-sm border border-border-input px-1" value={settings.timeModel} onChange={(e) => onChange({ ...settings, timeModel: e.target.value as TransactionalSettings['timeModel'] })}>
            <option value="best">best fit</option><option value="linear">linear</option><option value="poly2">polynomial 2</option>
            <option value="poly3">polynomial 3</option><option value="poly4">polynomial 4</option><option value="none">none</option>
          </select>
        </label>
      </div>
      <ul className="mt-3 text-xs text-text-muted" aria-label="What was applied">
        {prepared.map((d) => {
          const r = d.report.removed
          const removed = [r.leasehold && `${r.leasehold} leasehold`, r.nonCash && `${r.nonCash} seller financed`, r.reo && `${r.reo} REO`, r.shortSale && `${r.shortSale} short sale`].filter(Boolean).join(', ')
          const t = d.report.trend
          const trend = t && t.model === 'linear' ? `linear trend, ${t.coefficients[0] >= 0 ? '+' : '-'}$${Math.abs(t.coefficients[0]).toFixed(2)} per day (r² ${t.r2.toFixed(2)})` : t ? `${t.model} trend (r² ${t.r2.toFixed(2)})` : 'no time adjustment'
          return <li key={d.slot}>{d.name}: {d.props.length} sales{removed ? `, removed ${removed}` : ''}; {trend}{d.report.oldestDate ? `, oldest ${d.report.oldestDate}` : ''}</li>
        })}
      </ul>
    </details>
  )
}

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const [s, setS] = useState<Session | null | undefined>(undefined)
  const [asking, setAsking] = useState(false)
  const [adding, setAdding] = useState(false)
  const [panel, setPanel] = useState<'comments' | 'export' | 'paired' | null>(null)
  useEffect(() => { void getSession(id).then((x) => { setS(x); if (x && !x.subject) setAsking(true) }) }, [id])

  // Recompute only when data, subject, or modeled/chosen values change (not on slider constraint moves).
  const prepKey = s ? JSON.stringify([s.datasets.map((d) => d.properties.length), s.dataVersion ?? 0, s.transactional, s.effectiveDate]) : ''
  const prepared = useMemo(() => (s ? prepareDatasets(s) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prepKey])
  const calcKey = s ? JSON.stringify([prepKey, s.pairedSettings, s.subject, Object.entries(s.widgets).map(([k, w]) => [k, w.model ? w.chosen : null, w.subject])]) : ''
  const computed = useMemo(() => {
    if (!s?.subject) return {}
    return Object.fromEntries(Object.keys(s.widgets).map((k) => [k, computeFeature(s, k, prepared)]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey, prepared])

  if (s === undefined) return <p className="p-8 text-text-muted">Loading…</p>
  if (s === null) return <p className="p-8">Session not found. <Link className="text-accent" href="/sessions">Back to sessions</Link></p>
  const session = s
  const save = async (next: Session) => { setS(next); await saveSession(next) }
  const widgets = { ...Object.fromEntries(FEATURE_ORDER.map((k) => [k, defaultWidget()])), ...session.widgets }
  const patch = (key: string, p: Partial<WidgetState>) => save({ ...session, widgets: { ...widgets, [key]: { ...widgets[key], ...p } } })
  const keys = Object.keys(widgets)
  const sv = subjectValues(session)

  return (
    <div className="px-4 py-6" style={{ maxWidth: 1760, margin: '0 auto' }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{session.subject?.address || session.name}</h1>
          <p className="text-text-muted">{session.mls} · {session.propertyType} · effective {session.effectiveDate}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-md border border-border-input px-3 py-2 text-sm" href={`/session/${session.id}/datasets`}>Datasets</Link>
          <Button variant="secondary" onClick={() => setAsking(true)}>Edit subject</Button>
          <Button variant="secondary" onClick={() => setAdding(true)}>Add feature</Button>
          <Button variant="secondary" onClick={() => setPanel('paired')}>Paired sales settings</Button>
          <Button variant="secondary" onClick={() => setPanel('comments')}>View comments</Button>
          <Button onClick={() => setPanel('export')}>Export</Button>
        </div>
      </div>
      <TransactionalPanel
        settings={session.transactional ?? defaultTransactional}
        prepared={prepared}
        onChange={(t) => void save({ ...session, transactional: t })}
      />
      <div className="grid gap-3 rounded-md bg-workspace p-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(400px, 100%), 1fr))' }}>
        {keys.map((k) => (
          <FeatureWidget key={k} feature={resolveFeature(k) ?? FEATURES.gla} data={computed[k] ?? []} state={widgets[k]} subjectValue={sv[k] ?? null}
            subjectEditable={!(k in FEATURES && ['gla', 'lot_size', 'baths_full', 'baths_half', 'garage', 'stories'].includes(k))}
            onChange={(p) => void patch(k, p)}
            onRemove={() => { const { [k]: _gone, ...rest } = widgets; void save({ ...session, widgets: rest }) }} />
        ))}
      </div>
      {panel && (() => {
        const input: ReportInput = {
          session, prepared, results: computed, widgets,
          commentOptions: Object.fromEntries(Object.entries(widgets).map(([k, w]) => [k, w.comment ?? defaultCommentOptions])),
          analysisDate: new Date().toISOString().slice(0, 10),
        }
        const transactional = session.commentTransactional ?? true
        if (panel === 'paired') {
          return <PairedSettingsModal value={session.pairedSettings} prepared={prepared} featureKeys={keys}
            featureLabels={Object.fromEntries(keys.map((k) => [k, resolveFeature(k)?.label ?? k]))}
            onClose={() => setPanel(null)} onSave={(p) => { setPanel(null); void save({ ...session, pairedSettings: p }) }} />
        }
        return panel === 'comments'
          ? <CommentsModal input={input} transactional={transactional} onClose={() => setPanel(null)}
              onTransactional={(v) => void save({ ...session, commentTransactional: v })}
              onChange={(k, o) => void patch(k, { comment: o })} />
          : <ExportModal input={input} transactional={transactional} onClose={() => setPanel(null)} />
      })()}
      {adding && (
        <AddFeatureModal existing={keys} onClose={() => setAdding(false)}
          onAdd={(key) => { setAdding(false); void patch(key, defaultWidget()) }} />
      )}
      {asking && (
        <SubjectModal initial={session.subject ?? blank}
          onCancel={() => setAsking(false)}
          onDone={(sub) => { setAsking(false); void save({ ...session, subject: sub, widgets: Object.keys(session.widgets).length ? session.widgets : widgets }) }} />
      )}
    </div>
  )
}
