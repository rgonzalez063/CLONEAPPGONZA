'use client'
import { useEffect, useState } from 'react'
import { Button, TextInput } from '@/components/ui'
import { ApiError, deleteAccount, me, signOut } from '@/lib/store'

export default function AccountPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => { void me().then((u) => setEmail(u?.email ?? '')) }, [])
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-8">
      <h1 className="text-xl font-bold">Account</h1>
      <p>Signed in as <strong>{email}</strong></p>
      <section className="flex flex-col gap-2 rounded-md border border-border p-4">
        <h2 className="font-semibold">Sign out everywhere</h2>
        <p className="text-sm text-text-muted">Ends your login on every browser and device, including this one.</p>
        <Button variant="secondary" className="self-start" onClick={async () => { await signOut(true); window.location.assign('/login') }}>Sign out everywhere</Button>
      </section>
      <section className="flex flex-col gap-2 rounded-md border border-danger p-4">
        <h2 className="font-semibold text-danger">Delete my account</h2>
        <p className="text-sm text-text-muted">Deletes your account, every session, every sale you loaded and every template, for good. There is no undo.</p>
        <TextInput label="Your password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        {note && <p role="status" className="text-sm">{note}</p>}
        <Button variant="danger" className="self-start" disabled={!password}
          onClick={async () => {
            if (!confirm('Delete your account and all of your data? This cannot be undone.')) return
            try { await deleteAccount(password); setNote('Your account was deleted.'); window.location.assign('/login') } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong.') }
          }}>Delete my account</Button>
      </section>
    </div>
  )
}
