'use client'
import { diffEvents, type ActivityEvent, type LoggedEvent } from './activity'
import type { StoredProperty } from './importer'
import type { Listing } from '@/engines'
import type { Dataset, Session, SessionSummary, Template, TemplateFeature, TemplateSettings, WidgetState } from './types'

export type { Dataset, Session, SessionSummary, Subject, Template, TemplateFeature, TemplateSettings, WidgetState } from './types'

/**
 * Client data layer. Screens call only these functions; they talk to the server over /api.
 * Saves are debounced and sent as small patches (changed session fields, changed or removed sales).
 */
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: init?.method ?? 'GET', credentials: 'same-origin',
      // Every change request is JSON (an empty object when there is no body): the server refuses anything else, which blocks cross-site form posts.
      headers: (init?.method ?? 'GET') !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
      body: (init?.method ?? 'GET') !== 'GET' ? JSON.stringify(init?.body ?? {}) : undefined,
    })
  } catch { throw new ApiError(0, 'Could not reach the server. Check your connection.') }
  if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/api/auth/')) {
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`
    throw new ApiError(401, 'Please sign in.')
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'The request failed.')
  return data
}

// ------------------------------------------------------------------ accounts
export const me = () => api<{ user: { id: string; email: string } }>('/api/auth/me').then((r) => r.user).catch(() => null)
export const signIn = (email: string, password: string) => api<{ user: { email: string } }>('/api/auth/login', { method: 'POST', body: { email, password } })
export const signUp = (email: string, password: string) => api<{ user: { email: string } }>('/api/auth/signup', { method: 'POST', body: { email, password } })
export const signOut = (everywhere = false) => api('/api/auth/logout', { method: 'POST', body: { everywhere } })
export const deleteAccount = (password: string) => api('/api/auth/me', { method: 'DELETE', body: { password } })

// ------------------------------------------------------------------ save status
export type SaveStatus = 'idle' | 'saving' | 'error'
let status: SaveStatus = 'idle'
let lastError = ''
const listeners = new Set<(s: SaveStatus, message: string) => void>()
const setStatus = (s: SaveStatus, message = '') => { status = s; lastError = message; listeners.forEach((l) => l(s, message)) }
export function onSaveStatus(cb: (s: SaveStatus, message: string) => void): () => void {
  listeners.add(cb); cb(status, lastError)
  return () => { listeners.delete(cb) }
}

// ------------------------------------------------------------------ sessions
interface Snapshot { session: Session; props: Map<number, Map<string, StoredProperty>> }
const snapshots = new Map<string, Snapshot>()
const pending = new Map<string, { latest: Session; timer: ReturnType<typeof setTimeout>; waiters: { ok: () => void; fail: (e: unknown) => void }[] }>()
let chain: Promise<void> = Promise.resolve()

function snap(s: Session): Snapshot {
  return { session: s, props: new Map(s.datasets.map((d) => [d.slot, new Map(d.properties.map((p) => [p.id, p]))])) }
}

export async function listSessions(): Promise<SessionSummary[]> {
  return (await api<{ sessions: SessionSummary[] }>('/api/sessions')).sessions
}
export async function getSession(id: string): Promise<Session | null> {
  try {
    const s = (await api<{ session: Session }>(`/api/sessions/${encodeURIComponent(id)}`)).session
    snapshots.set(id, snap(s))
    return s
  } catch (e) { if (e instanceof ApiError && e.status === 404) return null; throw e }
}
export async function createSession(input: Pick<Session, 'name' | 'state' | 'mls' | 'propertyType' | 'template' | 'effectiveDate'> & { templateId?: string }): Promise<Session> {
  const s = (await api<{ session: Session }>('/api/sessions', { method: 'POST', body: input })).session
  snapshots.set(s.id, snap(s))
  return s
}
export async function deleteSession(id: string): Promise<void> {
  await api(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' })
  snapshots.delete(id)
  queued.delete(id)
}
export async function cloneSession(id: string): Promise<{ id: string; name: string }> {
  await flushNow(id)
  return (await api<{ session: { id: string; name: string } }>(`/api/sessions/${encodeURIComponent(id)}/clone`, { method: 'POST' })).session
}
export const setFavorite = (id: string, favorite: boolean) => api(`/api/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: { favorite } })

// ------------------------------------------------------------------ activity log
const queued = new Map<string, ActivityEvent[]>() // events waiting to be sent, kept if a send fails
const EVENT_BATCH = 200

async function sendEvents(id: string) {
  const list = queued.get(id)
  while (list && list.length) {
    const batch = list.slice(0, EVENT_BATCH)
    await api(`/api/sessions/${encodeURIComponent(id)}/events`, { method: 'POST', body: { events: batch } })
    list.splice(0, batch.length)
  }
}
/** Record something that is not a change to the saved session (an export, a template saved). Never blocks the caller on failure. */
export function logEvent(id: string, type: string, detail: Record<string, unknown> = {}): Promise<void> {
  const list = queued.get(id) ?? []
  list.push({ type, detail, at: new Date().toISOString() })
  queued.set(id, list)
  return sendEvents(id).catch(() => { /* stays queued; sent with the next save */ })
}
export async function listEvents(id: string): Promise<LoggedEvent[]> {
  await sendEvents(id).catch(() => {})
  return (await api<{ events: LoggedEvent[] }>(`/api/sessions/${encodeURIComponent(id)}/events`)).events
}
/** Save any waiting change right now. */
async function flushNow(id: string) {
  const job = pending.get(id)
  if (job) { job.timer && clearTimeout(job.timer); await saveSession(job.latest) }
  await chain
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const CHUNK = 1000

async function flush(id: string, latest: Session) {
  const base = snapshots.get(id)
  if (!base) return
  const was = base.session
  const patch: Record<string, unknown> = {}
  if (latest.name !== was.name) patch.name = latest.name
  if (latest.effectiveDate !== was.effectiveDate) patch.effectiveDate = latest.effectiveDate
  if (!same(latest.subject, was.subject) && latest.subject) patch.subject = latest.subject
  if (!same(latest.widgets, was.widgets)) patch.widgets = latest.widgets
  if (!same(latest.transactional, was.transactional) && latest.transactional) patch.transactional = latest.transactional
  if (!same(latest.pairedSettings, was.pairedSettings) && latest.pairedSettings) patch.pairedSettings = latest.pairedSettings
  if (latest.commentTransactional !== was.commentTransactional && latest.commentTransactional !== undefined) patch.commentTransactional = latest.commentTransactional
  if (latest.dataVersion !== was.dataVersion && latest.dataVersion !== undefined) patch.dataVersion = latest.dataVersion

  const nextProps = new Map(base.props)
  for (const d of latest.datasets) {
    const before = base.props.get(d.slot) ?? new Map<string, StoredProperty>()
    const body: Record<string, unknown> = {}
    const old = was.datasets.find((x) => x.slot === d.slot)
    if (old && d.name !== old.name) body.name = d.name
    if (old && d.excludedAfterEffective !== old.excludedAfterEffective) body.excludedAfterEffective = d.excludedAfterEffective
    const nowIds = new Set(d.properties.map((p) => p.id))
    const changed = d.properties.filter((p) => before.get(p.id) !== p)
    const gone = [...before.keys()].filter((k) => !nowIds.has(k))
    if (d.properties.length === 0 && before.size > 0) body.clear = true
    else if (gone.length) body.remove = gone
    const sendProps = async () => {
      for (let i = 0; i < Math.max(1, Math.ceil(changed.length / CHUNK)); i++) {
        const part = changed.slice(i * CHUNK, (i + 1) * CHUNK)
        const b = i === 0 ? { ...body, upsert: part } : { upsert: part }
        if (i === 0 && !part.length && !Object.keys(body).length) return
        await api(`/api/sessions/${encodeURIComponent(id)}/datasets/${d.slot}`, { method: 'PATCH', body: b })
      }
    }
    await sendProps()
    nextProps.set(d.slot, new Map(d.properties.map((p) => [p.id, p])))
  }
  if (Object.keys(patch).length) await api(`/api/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch })
  snapshots.set(id, { session: latest, props: nextProps })
  const events = diffEvents(was, latest, base.props).map((e) => ({ ...e, at: new Date().toISOString() }))
  if (events.length) { queued.set(id, [...(queued.get(id) ?? []), ...events]) }
  await sendEvents(id).catch(() => { /* a failed log send never fails the save */ })
}

async function runFlush(id: string, latest: Session) {
  let delay = 400
  for (let attempt = 0; ; attempt++) {
    try { await flush(id, latest); return } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) throw e // retrying will not help
      if (attempt >= 3) throw e
      await new Promise((r) => setTimeout(r, delay)); delay *= 3
    }
  }
}

/** Queue a save. Rapid changes are combined; resolves when the latest state is stored. */
export function saveSession(s: Session): Promise<void> {
  const cur = pending.get(s.id)
  if (cur) clearTimeout(cur.timer)
  const waiters = cur?.waiters ?? []
  return new Promise<void>((ok, fail) => {
    waiters.push({ ok, fail })
    setStatus('saving')
    const timer = setTimeout(() => {
      const job = pending.get(s.id)
      if (!job) return
      pending.delete(s.id)
      chain = chain.then(async () => {
        try {
          await runFlush(s.id, job.latest)
          job.waiters.forEach((w) => w.ok())
          if (pending.size === 0) setStatus('idle')
        } catch (e) {
          setStatus('error', e instanceof Error ? e.message : 'Could not save.')
          job.waiters.forEach((w) => w.fail(e))
        }
      })
    }, 250)
    pending.set(s.id, { latest: s, timer, waiters })
  })
}
export const hasUnsavedChanges = () => pending.size > 0 || status === 'saving'

// ------------------------------------------------------------------ templates
export const listTemplates = async (mls?: string, propertyType?: string): Promise<Template[]> => {
  const q = new URLSearchParams()
  if (mls) q.set('mls', mls)
  if (propertyType) q.set('propertyType', propertyType)
  return (await api<{ templates: Template[] }>(`/api/templates?${q}`)).templates
}
export type TemplateDraft = Pick<Template, 'name' | 'state' | 'mls' | 'propertyType' | 'settings' | 'features' | 'datasetNames'> & { isDefault?: boolean }
export const createTemplate = async (t: TemplateDraft) => (await api<{ template: Template }>('/api/templates', { method: 'POST', body: t })).template
export const updateTemplate = async (id: string, t: Partial<TemplateDraft>) => (await api<{ template: Template }>(`/api/templates/${id}`, { method: 'PUT', body: t })).template
export const deleteTemplate = (id: string) => api(`/api/templates/${id}`, { method: 'DELETE' })

/** What a template keeps from a session: settings, which features, their order and comment options, dataset names. No data, no results. */
export function templateContents(s: Session): { settings: TemplateSettings; features: TemplateFeature[]; datasetNames: string[] } {
  return {
    settings: { transactional: s.transactional, pairedSettings: s.pairedSettings, commentTransactional: s.commentTransactional },
    features: Object.entries(s.widgets).map(([key, w]: [string, WidgetState]) => ({ key, ...(w.comment ? { comment: w.comment } : {}) })),
    datasetNames: s.datasets.map((d: Dataset) => d.name),
  }
}

// ------------------------------------------------------------------ one-time move from this browser's old local storage
const OLD_KEY = 'asup.sessions.v1'
export function oldBrowserSessions(): Session[] {
  try { return Object.values(JSON.parse(localStorage.getItem(OLD_KEY) ?? '{}') as Record<string, Session>) } catch { return [] }
}
export async function importOldSession(old: Session): Promise<Session> {
  const created = await createSession({ name: old.name, state: old.state, mls: old.mls, propertyType: old.propertyType, template: old.template ?? 'Standard', effectiveDate: old.effectiveDate })
  const next: Session = { ...created, subject: old.subject, widgets: old.widgets, transactional: old.transactional, pairedSettings: old.pairedSettings, commentTransactional: old.commentTransactional, dataVersion: old.dataVersion ?? 0, datasets: old.datasets }
  await saveSession(next)
  return next
}
export function forgetOldBrowserSessions() { try { localStorage.removeItem(OLD_KEY) } catch { /* ignore */ } }

// ------------------------------------------------------------------ market files (every listing of every status)
export interface MarketFile { slot: number; name: string; listings: Listing[]; notes: Record<string, string | boolean | null>; updatedAt: string }
export const getMarketFiles = async (id: string) => (await api<{ files: MarketFile[] }>(`/api/sessions/${encodeURIComponent(id)}/market`)).files
export const putMarketFile = (id: string, slot: number, body: { name?: string; listings?: Listing[]; notes?: MarketFile['notes'] }) =>
  api(`/api/sessions/${encodeURIComponent(id)}/market/${slot}`, { method: 'PUT', body })
export const deleteMarketFile = (id: string, slot: number) => api(`/api/sessions/${encodeURIComponent(id)}/market/${slot}`, { method: 'DELETE' })
