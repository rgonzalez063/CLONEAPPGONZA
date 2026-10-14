'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { PropertyGrid } from '@/components/PropertyGrid'
import { Button, TextInput } from '@/components/ui'
import { COLUMNS, editProperty, revertField, setDeleted, type Column } from '@/lib/propertyOps'
import type { StoredProperty } from '@/lib/importer'
import { getSession, saveSession, type Session } from '@/lib/store'

export default function PropertiesPage() {
  const { id, slot } = useParams<{ id: string; slot: string }>()
  const [s, setS] = useState<Session | null | undefined>(undefined)
  const [query, setQuery] = useState('')
  const [deletedView, setDeletedView] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  useEffect(() => { void getSession(id).then(setS) }, [id])
  const dataset = s?.datasets.find((d) => d.slot === Number(slot))
  const rows = useMemo(() => (dataset ? dataset.properties.filter((p) => !!p.deleted === deletedView) : []), [dataset, deletedView])

  if (s === undefined) return <p className="p-8 text-text-muted">Loading…</p>
  if (!s || !dataset) return <p className="p-8">Dataset not found. <Link className="text-accent" href="/sessions">Back to sessions</Link></p>
  const session = s
  const ds = dataset

  const update = async (fn: (list: StoredProperty[]) => StoredProperty[]) => {
    const next: Session = {
      ...session, dataVersion: (session.dataVersion ?? 0) + 1,
      datasets: session.datasets.map((d) => (d.slot === ds.slot ? { ...d, properties: fn(d.properties) } : d)),
    }
    setS(next)
    await saveSession(next)
  }
  const editedCount = dataset.properties.filter((p) => p.edits && Object.keys(p.edits).length).length
  const deletedCount = dataset.properties.filter((p) => p.deleted).length
  const chosen = [...selected].filter((x) => rows.some((p) => p.id === x))

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link className="text-accent" href={`/session/${session.id}/datasets`}>← Datasets</Link>
          <h1 className="text-lg font-semibold">{dataset.name}: {deletedView ? 'removed sales' : 'sales'}</h1>
          <p className="text-text-muted">{dataset.properties.length - deletedCount} in use · {deletedCount} removed · {editedCount} edited. Results update as soon as you change the data.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-64"><TextInput label="Search every column" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          {!deletedView && (
            <Button variant="danger" disabled={chosen.length === 0}
              onClick={async () => { await update((l) => setDeleted(l, new Set(chosen), true)); setNote(`Removed ${chosen.length} sale${chosen.length === 1 ? '' : 's'}. You can bring them back from the removed list.`); setSelected(new Set()) }}>
              Remove selected ({chosen.length})
            </Button>
          )}
          {deletedView && (
            <Button disabled={chosen.length === 0}
              onClick={async () => { await update((l) => setDeleted(l, new Set(chosen), false)); setNote(`Recovered ${chosen.length} sale${chosen.length === 1 ? '' : 's'}.`); setSelected(new Set()) }}>
              Recover selected ({chosen.length})
            </Button>
          )}
          <Button variant="secondary" onClick={() => { setDeletedView(!deletedView); setSelected(new Set()); setNote('') }}>
            {deletedView ? 'Back to sales in use' : `View removed (${deletedCount})`}
          </Button>
        </div>
      </div>
      {note && <p role="status" className="mb-2 text-sm text-success">{note}</p>}
      {rows.length === 0 && <p className="rounded-md border border-border p-6 text-center text-text-muted">{deletedView ? 'No sales have been removed.' : 'No sales in this dataset.'}</p>}
      {rows.length > 0 && (
        <PropertyGrid rows={rows} selected={selected} onSelect={setSelected} query={query} label={`${dataset.name} sales`}
          onRevert={(pid, col) => void update((l) => l.map((p) => (p.id === pid ? revertField(p, col) : p)))}
          onEdit={(pid, col: Column, raw) => {
            const target = dataset.properties.find((p) => p.id === pid)
            if (!target) return 'That sale no longer exists.'
            const r = editProperty(target, col, raw)
            if (!r.ok) return r.error
            void update((l) => l.map((p) => (p.id === pid ? r.property : p)))
            return null
          }} />
      )}
      <p className="mt-3 text-xs text-text-muted">Columns you can edit: {COLUMNS.filter((c) => c.editable).map((c) => c.label).join(', ')}. Edited values are shown in blue with an undo link, and every edit and removal is listed in the workfile.</p>
    </div>
  )
}
