'use client'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { Button, TextInput } from '@/components/ui'
import { ApiError, signIn, signUp } from '@/lib/store'

function Form() {
  const params = useSearchParams()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = params.get('next')
  const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'

  async function submit() {
    setBusy(true); setError('')
    try {
      await (mode === 'in' ? signIn(email, password) : signUp(email, password))
      window.location.assign(dest) // a full load, so the router does not reuse a cached redirect to /login
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong.') } finally { setBusy(false) }
  }
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 px-4 py-10">
      <h1 className="text-center text-xl font-bold">{mode === 'in' ? 'Sign in' : 'Create your account'}</h1>
      <form className="flex flex-col gap-3 rounded-md border border-border p-4 shadow-card" onSubmit={(e) => { e.preventDefault(); void submit() }}>
        <TextInput label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextInput label="Password" type="password" required autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
          hint={mode === 'up' ? 'At least 10 characters.' : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</Button>
      </form>
      <button type="button" className="text-sm text-accent" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError('') }}>
        {mode === 'in' ? 'First time here? Create an account' : 'I already have an account'}
      </button>
      <p className="text-center text-xs text-text-muted">Your sales data and settings are stored on this site&apos;s database and are visible only to you.</p>
    </div>
  )
}
export default function LoginPage() { return <Suspense fallback={null}><Form /></Suspense> }
