'use client'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Button, TextInput } from '@/components/ui'
import { useRouter } from 'next/navigation'
import { cloneSession, deleteSession, setFavorite, forgetOldBrowserSessions, importOldSession, listSessions, oldBrowserSessions, type SessionSummary } from '@/lib/store'

export default function SessionsPage() {
  const [items, setItems] = useState<SessionSummary[] | null>(null)
  const [error, setError] = useState('')
  const [old, setOld] = useState(0)
  const [moving, setMoving] = useState(false)
  const [q, setQ] = useState('')
  const [onlyFav, setOnlyFav] = useState(false)
  const router = useRouter()
  useEffect(() => { listSessions().then(setItems).catch((e: Error) => setError(e.message)); setOld(oldBrowserSessions().length) }, [])
  const shown = useMemo(() => (items ?? []).filter((s) => !onlyFav || s.favorite).filter((s) => `${s.name} ${s.mls} ${s.propertyType}`.toLowerCase().includes(q.toLowerCase())), [items, q, onlyFav])
  const star = async (s: SessionSummary) => {
    setItems((cur) => (cur ?? []).map((x) => (x.id === s.id ? { ...x, favorite: !s.favorite } : x)))
    try { await setFavorite(s.id, !s.favorite) } catch (e) { setError(e instanceof Error ? e.message : 'Could not update.'); setItems(await listSessions()) }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-4 text-xl font-bold">Sessions</h1>
      <TextInput label="Search by name, MLS or type" value={q} onChange={(e) => setQ(e.target.value)} />
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyFav} onChange={(e) => setOnlyFav(e.target.checked)} />Show favorites only</label>
      {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
      {old > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3" role="status">
          <span>This browser still holds {old} session{old === 1 ? '' : 's'} from before accounts existed.</span>
          <Button loading={moving} onClick={async () => {
            setMoving(true)
            try { for (const o of oldBrowserSessions()) await importOldSession(o); forgetOldBrowserSessions(); setOld(0); setItems(await listSessions()) }
            catch (e) { setError(e instanceof Error ? e.message : 'The move failed.') } finally { setMoving(false) }
          }}>Move them to my account</Button>
        </div>
      )}
      {items === null && !error && <p className="mt-6 text-text-muted">Loading…</p>}
      {items !== null && shown.length === 0 && (
        <p className="mt-6 text-text-muted">{items.length === 0 ? 'No sessions yet. ' : 'No matches. '}<Link className="text-accent" href="/">Start one</Link>.</p>
      )}
      <ul className="mt-4 flex flex-col gap-2">
        {shown.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border p-3">
            <button type="button" aria-pressed={s.favorite} aria-label={`Favorite ${s.name}`} title="Favorite" onClick={() => star(s)} className="shrink-0 rounded-md px-2 py-1 text-lg">{s.favorite ? '♥' : '♡'}</button>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{s.name}</div>
              <div className="text-xs text-text-muted">{s.mls} · {s.propertyType} · effective {s.effectiveDate}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Link className="rounded-md border border-border-input px-3 py-2 text-sm" href={`/session/${s.id}/results`}>Open</Link>
              <Link className="rounded-md border border-border-input px-3 py-2 text-sm" href={`/session/${s.id}/activity`}>Activity</Link>
              <Button variant="secondary" onClick={async () => { try { const c = await cloneSession(s.id); router.push(`/session/${c.id}/results`) } catch (e) { setError(e instanceof Error ? e.message : 'Could not clone.') } }}>Clone</Button>
              <Button variant="secondary" onClick={async () => { if (confirm(`Delete "${s.name}"?`)) { await deleteSession(s.id); setItems(await listSessions()) } }}>Delete</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
