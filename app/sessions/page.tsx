'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Button, TextInput } from '@/components/ui'
import { deleteSession, listSessions, type Session } from '@/lib/store'

export default function SessionsPage() {
  const [items, setItems] = useState<Session[] | null>(null)
  const [q, setQ] = useState('')
  useEffect(() => { void listSessions().then(setItems) }, [])
  const shown = useMemo(() => (items ?? []).filter((s) => `${s.name} ${s.mls} ${s.propertyType}`.toLowerCase().includes(q.toLowerCase())), [items, q])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-xl font-bold">Sessions</h1>
      <TextInput label="Search by name, MLS or type" value={q} onChange={(e) => setQ(e.target.value)} />
      {items === null && <p className="mt-6 text-text-muted">Loading…</p>}
      {items !== null && shown.length === 0 && (
        <p className="mt-6 text-text-muted">{items.length === 0 ? 'No sessions yet. ' : 'No matches. '}<Link className="text-accent" href="/">Start one</Link>.</p>
      )}
      <ul className="mt-4 flex flex-col gap-2">
        {shown.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
            <div className="min-w-0">
              <div className="truncate font-semibold">{s.name}</div>
              <div className="text-xs text-text-muted">{s.mls} · {s.propertyType} · effective {s.effectiveDate}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link className="rounded-md border border-border-input px-3 py-2 text-sm" href={`/session/${s.id}/results`}>Open</Link>
              <Button variant="secondary" onClick={async () => { if (confirm(`Delete "${s.name}"?`)) { await deleteSession(s.id); setItems(await listSessions()) } }}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
