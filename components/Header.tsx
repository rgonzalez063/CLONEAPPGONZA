'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { hasUnsavedChanges, me, onSaveStatus, signOut, type SaveStatus } from '@/lib/store'

export function Header() {
  const path = usePathname()
  const [email, setEmail] = useState<string | null>(null)
  const [status, setStatus] = useState<{ s: SaveStatus; message: string }>({ s: 'idle', message: '' })
  useEffect(() => { if (path !== '/login') void me().then((u) => setEmail(u?.email ?? null)) }, [path])
  useEffect(() => onSaveStatus((s, message) => setStatus({ s, message })), [])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (hasUnsavedChanges()) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  return (
    <header className="flex flex-wrap items-center gap-4 border-b border-border px-4 py-2">
      <Link href="/" className="text-base font-semibold">Adjustment Support</Link>
      {email && (
        <nav aria-label="Main" className="flex gap-4 text-sm text-text-muted">
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/sessions">Sessions</Link>
          <Link href="/templates">Templates</Link>
          <Link href="/design">Design</Link>
        </nav>
      )}
      <div className="ml-auto flex items-center gap-3 text-sm">
        <span role="status" aria-live="polite" className={status.s === 'error' ? 'text-danger' : 'text-text-muted'}>
          {status.s === 'saving' ? 'Saving…' : status.s === 'error' ? `Not saved: ${status.message}` : email ? 'All changes saved' : ''}
        </span>
        {email && (
          <>
            <Link href="/account" className="text-text-muted">{email}</Link>
            <button type="button" className="text-accent" onClick={async () => { await signOut(); setEmail(null); window.location.assign('/login') }}>Sign out</button>
          </>
        )}
      </div>
    </header>
  )
}
