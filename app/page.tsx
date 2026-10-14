'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Button, Select, TextInput } from '@/components/ui'
import { createSession, listTemplates, type Template } from '@/lib/store'

const today = () => new Date().toISOString().slice(0, 10)

export default function StartPage() {
  const router = useRouter()
  const [state, setState] = useState('TX')
  const [mls, setMls] = useState('HARMLS')
  const [type, setType] = useState('SFR')
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState('') // '' = built-in Standard
  const [date, setDate] = useState(today())
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dateError = !date ? 'Choose an effective date.' : undefined
  useEffect(() => {
    listTemplates(mls, type).then((t) => { setTemplates(t); setTemplateId(t.find((x) => x.isDefault)?.id ?? '') }).catch(() => setTemplates([]))
  }, [mls, type])

  async function start() {
    if (dateError) return
    setBusy(true); setError('')
    try {
      const chosen = templates.find((t) => t.id === templateId)
      const s = await createSession({ name, state, mls, propertyType: type, template: chosen?.name ?? 'Standard', effectiveDate: date, ...(chosen ? { templateId: chosen.id } : {}) })
      router.push(`/session/${s.id}/datasets`)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start the session.'); setBusy(false) }
  }

  return (
    <div className="mx-auto flex flex-col gap-4 px-4 py-8" style={{ maxWidth: 420 }}>
      <h1 className="text-center text-xl font-bold">Start a new session</h1>
      <form className="flex flex-col gap-3 rounded-md border border-border p-4 shadow-card" onSubmit={(e) => { e.preventDefault(); void start() }}>
        <Select label="State" value={state} onChange={(e) => setState(e.target.value)} options={['TX']} />
        <Select label="MLS" value={mls} onChange={(e) => setMls(e.target.value)} options={['HARMLS']} />
        <Select label="Property type" value={type} onChange={(e) => setType(e.target.value)} options={['SFR']} />
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <label htmlFor="template" className="text-xs text-text-muted">{`Template (for ${mls}/${type})`}</label>
            <Link href="/templates" className="text-xs text-accent">Template management</Link>
          </div>
          <select id="template" className="h-10 w-full rounded-md border border-border-input bg-bg px-3 text-sm" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
            <option value="">Standard (built in)</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (default)' : ''}</option>)}
          </select>
        </div>
        <TextInput label="Effective date" type="date" value={date} error={dateError} onChange={(e) => setDate(e.target.value)} />
        <TextInput label="Session name" placeholder="optional" value={name} onChange={(e) => setName(e.target.value)} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={busy} className="h-12">Start session</Button>
      </form>
      <Link href="/sessions" className="rounded-md border border-border py-3 text-center text-accent shadow-card">Open an existing session</Link>
      <p className="text-center text-xs text-text-muted">This first version supports HARMLS, single-family. Data stays in this browser.</p>
    </div>
  )
}
