'use client'
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'danger' | 'link'
export function Button({ variant = 'primary', loading, className = '', children, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-md px-4 h-10 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed'
  const v: Record<Variant, string> = {
    primary: 'bg-accent text-on-accent hover:opacity-90',
    secondary: 'border border-border-input bg-bg text-text hover:bg-surface',
    danger: 'bg-danger text-on-accent hover:opacity-90',
    link: 'h-auto px-0 text-accent underline-offset-2 hover:underline',
  }
  return (
    <button className={`${base} ${v[variant]} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading && <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  )
}

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: (id: string, describedBy?: string) => ReactNode }) {
  const id = useId()
  const msg = error ?? hint
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-text-muted">{label}</label>
      {children(id, msg ? `${id}-msg` : undefined)}
      {msg && <p id={`${id}-msg`} className={`text-xs ${error ? 'text-danger' : 'text-text-muted'}`}>{msg}</p>}
    </div>
  )
}

const control = 'h-10 w-full rounded-md border border-border-input bg-bg px-3 text-sm'
export function Select({ label, error, options, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; options: string[] }) {
  return (
    <Field label={label} error={error}>
      {(id, d) => (
        <select id={id} aria-describedby={d} aria-invalid={!!error} className={control} {...rest}>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
    </Field>
  )
}
export function TextInput({ label, error, hint, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }) {
  return (
    <Field label={label} error={error} hint={hint}>
      {(id, d) => <input id={id} aria-describedby={d} aria-invalid={!!error} className={`${control} ${error ? 'border-danger' : ''}`} {...rest} />}
    </Field>
  )
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="flex items-center justify-end gap-2 text-xs text-text-muted">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-pill ${checked ? 'bg-accent' : 'bg-toggle-off'}`} style={{ borderRadius: 999 }}>
        <span className="absolute top-0.5 h-4 w-4 rounded-full bg-bg transition-all" style={{ left: checked ? 18 : 2 }} />
      </button>
    </label>
  )
}

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input,select,button')?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus() }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/60 p-4" role="presentation">
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[90vh] w-full max-w-xl flex-col rounded-lg bg-bg shadow-pop">
        <h2 className="px-6 pt-6 text-center text-lg font-semibold">{title}</h2>
        <div className="overflow-y-auto px-6 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-border bg-surface px-6 py-3">{footer}</div>
      </div>
    </div>
  )
}
