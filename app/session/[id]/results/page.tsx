'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { FeatureWidget } from '@/components/FeatureWidget'
import { Button, Modal, TextInput } from '@/components/ui'
import { computeFeature, defaultWidget, subjectValues } from '@/lib/analysis'
import { FEATURES, FEATURE_ORDER } from '@/lib/features'
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

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>()
  const [s, setS] = useState<Session | null | undefined>(undefined)
  const [asking, setAsking] = useState(false)
  useEffect(() => { void getSession(id).then((x) => { setS(x); if (x && !x.subject) setAsking(true) }) }, [id])

  // Recompute only when data, subject, or modeled/chosen values change (not on slider constraint moves).
  const calcKey = s ? JSON.stringify([s.datasets.map((d) => d.properties.length), s.subject, Object.entries(s.widgets).map(([k, w]) => [k, w.model ? w.chosen : null])]) : ''
  const computed = useMemo(() => {
    if (!s?.subject) return {}
    return Object.fromEntries(Object.keys(s.widgets).map((k) => [k, computeFeature(s, k)]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcKey])

  if (s === undefined) return <p className="p-8 text-text-muted">Loading…</p>
  if (s === null) return <p className="p-8">Session not found. <Link className="text-accent" href="/sessions">Back to sessions</Link></p>
  const session = s
  const save = async (next: Session) => { setS(next); await saveSession(next) }
  const widgets = { ...Object.fromEntries(FEATURE_ORDER.map((k) => [k, defaultWidget()])), ...session.widgets }
  const patch = (key: string, p: Partial<WidgetState>) => save({ ...session, widgets: { ...widgets, [key]: { ...widgets[key], ...p } } })
  const keys = Object.keys(widgets)
  const sv = subjectValues(session)
  const addable = Object.keys(FEATURES).filter((k) => !keys.includes(k))

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
          {addable.length > 0 && (
            <select aria-label="Add a feature" className="h-10 rounded-md border border-border-input px-2" value=""
              onChange={(e) => { if (e.target.value) void patch(e.target.value, defaultWidget()) }}>
              <option value="">Add feature…</option>
              {addable.map((k) => <option key={k} value={k}>{FEATURES[k].label}</option>)}
            </select>
          )}
        </div>
      </div>
      <div className="grid gap-3 rounded-md bg-workspace p-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(400px, 100%), 1fr))' }}>
        {keys.map((k) => (
          <FeatureWidget key={k} feature={FEATURES[k]} data={computed[k] ?? []} state={widgets[k]} subjectValue={sv[k] ?? null}
            onChange={(p) => void patch(k, p)}
            onRemove={() => { const { [k]: _gone, ...rest } = widgets; void save({ ...session, widgets: rest }) }} />
        ))}
      </div>
      {asking && (
        <SubjectModal initial={session.subject ?? blank}
          onCancel={() => setAsking(false)}
          onDone={(sub) => { setAsking(false); void save({ ...session, subject: sub, widgets: Object.keys(session.widgets).length ? session.widgets : widgets }) }} />
      )}
    </div>
  )
}
