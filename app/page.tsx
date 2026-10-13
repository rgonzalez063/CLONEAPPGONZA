'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button, Select, TextInput } from '@/components/ui'
import { createSession } from '@/lib/store'

const today = () => new Date().toISOString().slice(0, 10)

export default function StartPage() {
  const router = useRouter()
  const [state, setState] = useState('TX')
  const [mls, setMls] = useState('HARMLS')
  const [type, setType] = useState('SFR')
  const [template, setTemplate] = useState('Standard')
  const [date, setDate] = useState(today())
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const dateError = !date ? 'Choose an effective date.' : undefined

  async function start() {
    if (dateError) return
    setBusy(true)
    const s = await createSession({ name, state, mls, propertyType: type, template, effectiveDate: date })
    router.push(`/session/${s.id}/datasets`)
  }

  return (
    <div className="mx-auto flex flex-col gap-4 px-4 py-8" style={{ maxWidth: 420 }}>
      <h1 className="text-center text-xl font-bold">Start a new session</h1>
      <form className="flex flex-col gap-3 rounded-md border border-border p-4 shadow-card" onSubmit={(e) => { e.preventDefault(); void start() }}>
        <Select label="State" value={state} onChange={(e) => setState(e.target.value)} options={['TX']} />
        <Select label="MLS" value={mls} onChange={(e) => setMls(e.target.value)} options={['HARMLS']} />
        <Select label="Property type" value={type} onChange={(e) => setType(e.target.value)} options={['SFR']} />
        <Select label={`Template (for ${mls}/${type})`} value={template} onChange={(e) => setTemplate(e.target.value)} options={['Standard']} />
        <TextInput label="Effective date" type="date" value={date} error={dateError} onChange={(e) => setDate(e.target.value)} />
        <TextInput label="Session name" placeholder="optional" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" loading={busy} className="h-12">Start session</Button>
      </form>
      <Link href="/sessions" className="rounded-md border border-border py-3 text-center text-accent shadow-card">Open an existing session</Link>
      <p className="text-center text-xs text-text-muted">This first version supports HARMLS, single-family. Data stays in this browser.</p>
    </div>
  )
}
