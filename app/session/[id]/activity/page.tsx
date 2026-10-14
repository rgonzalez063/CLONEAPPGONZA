'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { TextInput } from '@/components/ui'
import { eventDetail, eventTitle, type LoggedEvent } from '@/lib/activity'
import { getSession, listEvents } from '@/lib/store'

type SortKey = 'ts' | 'title' | 'detail'

export default function ActivityPage() {
  const { id } = useParams<{ id: string }>()
  const [events, setEvents] = useState<LoggedEvent[] | null>(null)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'ts', dir: -1 })

  useEffect(() => {
    getSession(id).then((s) => setName(s?.subject?.address || s?.name || '')).catch(() => {})
    listEvents(id).then(setEvents).catch((e: Error) => setError(e.message))
  }, [id])

  const rows = useMemo(() => (events ?? []).map((e) => ({ e, title: eventTitle(e.type), detail: eventDetail(e.type, e.detail), when: new Date(e.ts) })), [events])
  const types = useMemo(() => [...new Set(rows.map((r) => r.e.type))].sort(), [rows])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = rows.filter((r) => (!type || r.e.type === type) && (!needle || `${r.title} ${r.detail}`.toLowerCase().includes(needle)))
    const val = (r: (typeof rows)[number]) => (sort.key === 'ts' ? r.when.getTime() : sort.key === 'title' ? r.title.toLowerCase() : r.detail.toLowerCase())
    return list.sort((a, b) => (val(a) < val(b) ? -sort.dir : val(a) > val(b) ? sort.dir : b.e.id - a.e.id))
  }, [rows, q, type, sort])

  const head = (key: SortKey, text: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className="px-3 py-2 text-left">
      <button type="button" className="font-semibold" onClick={() => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'ts' ? -1 : 1 }))}>
        {text}{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
      </button>
    </th>
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Activity log</h1>
          {name && <p className="text-text-muted">{name}</p>}
        </div>
        <div className="flex gap-2 text-sm">
          <Link className="rounded-md border border-border-input px-3 py-2" href={`/session/${id}/results`}>Back to results</Link>
          <Link className="rounded-md border border-border-input px-3 py-2" href="/sessions">All sessions</Link>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Search the log" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex flex-col gap-1 text-sm font-medium">Kind of event
          <select className="rounded-md border border-border-input bg-surface px-3 py-2" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All events</option>
            {types.map((t) => <option key={t} value={t}>{eventTitle(t)}</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
      {events === null && !error && <p className="mt-6 text-text-muted">Loading…</p>}
      {events !== null && (
        <>
          <p className="mt-4 text-sm text-text-muted" role="status">{shown.length} of {rows.length} events</p>
          <div className="mt-2 overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface"><tr>{head('ts', 'Time')}{head('title', 'Event')}{head('detail', 'Details')}</tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.e.id} className="border-t border-border align-top">
                    <td className="whitespace-nowrap px-3 py-2">{r.when.toLocaleString('en-US')}</td>
                    <td className="px-3 py-2 font-medium">{r.title}</td>
                    <td className="px-3 py-2">{r.detail}</td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-text-muted">No events match.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
