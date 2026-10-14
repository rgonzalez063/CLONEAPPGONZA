'use client'
import { useEffect, useState } from 'react'
import { Button, TextInput } from '@/components/ui'
import { resolveFeature } from '@/lib/features'
import { ApiError, createTemplate, deleteTemplate, listTemplates, updateTemplate, type Template } from '@/lib/store'

const summary = (t: Template) => {
  const names = t.features.map((f) => resolveFeature(f.key)?.label ?? f.key)
  const s = t.settings
  return [
    names.length ? `Features: ${names.join(', ')}` : 'No features saved (the app default list is used).',
    `Time adjustment: ${s.transactional ? `${s.transactional.timeModel} by ${s.transactional.timeBasis} date` : 'default'}`,
    `Paired sales rules: ${s.pairedSettings ? 'customized' : 'default'}`,
  ]
}

export default function TemplatesPage() {
  const [items, setItems] = useState<Template[] | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const reload = () => listTemplates().then(setItems).catch((e: Error) => setError(e.message))
  useEffect(() => { void reload() }, [])
  const run = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); await reload() } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong.') } }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-1 text-xl font-bold">Templates</h1>
      <p className="mb-4 text-text-muted">A template is a starting point for new sessions: your settings, the features you analyze and their order. Create one from a session with &ldquo;Save as template&rdquo; on the results page.</p>
      {error && <p role="alert" className="mb-3 text-danger">{error}</p>}
      {items === null && !error && <p className="text-text-muted">Loading…</p>}
      {items?.length === 0 && <p className="rounded-md border border-border p-6 text-center text-text-muted">No templates yet.</p>}
      <ul className="flex flex-col gap-3">
        {items?.map((t) => (
          <li key={t.id} className="rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                {editing?.id === t.id ? (
                  <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await updateTemplate(t.id, { name: editing.name }); setEditing(null) }) }}>
                    <TextInput label="Name" value={editing.name} onChange={(e) => setEditing({ id: t.id, name: e.target.value })} autoFocus />
                    <Button type="submit">Save</Button><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                  </form>
                ) : (
                  <h2 className="truncate font-semibold">{t.name}{t.isDefault && <span className="ml-2 rounded-pill bg-accent-soft px-2 py-0.5 text-xs font-normal" style={{ borderRadius: 999 }}>default</span>}</h2>
                )}
                <p className="text-xs text-text-muted">{t.mls} · {t.propertyType} · {t.state}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setEditing({ id: t.id, name: t.name })}>Rename</Button>
                {!t.isDefault && <Button variant="secondary" onClick={() => void run(() => updateTemplate(t.id, { isDefault: true }))}>Make default</Button>}
                <Button variant="secondary" onClick={() => void run(() => createTemplate({ name: `${t.name} copy`, state: t.state, mls: t.mls, propertyType: t.propertyType, settings: t.settings, features: t.features, datasetNames: t.datasetNames }))}>Clone</Button>
                <Button variant="danger" onClick={() => { if (confirm(`Delete the template "${t.name}"? Sessions already started from it are not changed.`)) void run(() => deleteTemplate(t.id)) }}>Delete</Button>
              </div>
            </div>
            <ul className="mt-2 text-xs text-text-muted">{summary(t).map((x) => <li key={x}>{x}</li>)}</ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
