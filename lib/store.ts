'use client'
import type { StoredProperty } from './importer'

/**
 * Fake data layer: localStorage, with the function signatures the real (Postgres) layer will keep.
 * Screens call only these functions, so swapping the backend changes no screen code.
 */
export interface Session {
  id: string
  name: string
  state: string
  mls: string
  propertyType: string
  template: string
  effectiveDate: string
  createdAt: string
  updatedAt: string
  datasets: Dataset[]
  subject: Subject | null
  widgets: Record<string, WidgetState>
}
export interface Dataset { slot: number; name: string; properties: StoredProperty[]; excludedAfterEffective: number }
export interface Subject {
  address: string; zip: string; gla: number | null; lot_size: number | null
  baths_full: number | null; baths_half: number | null; stories: number | null; garage: number | null
}
export interface WidgetState {
  chosen: number | null; done: boolean; locked: boolean; model: boolean
  low: number | null; high: number | null // constraint (null = unconstrained)
  snip?: boolean
}

const KEY = 'asup.sessions.v1'
const read = (): Record<string, Session> => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') } catch { return {} }
}
const write = (all: Record<string, Session>) => {
  try { localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* storage full or blocked */ }
}

export async function listSessions(): Promise<Session[]> {
  return Object.values(read()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}
export async function getSession(id: string): Promise<Session | null> {
  return read()[id] ?? null
}
export async function createSession(input: Pick<Session, 'name' | 'state' | 'mls' | 'propertyType' | 'template' | 'effectiveDate'>): Promise<Session> {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const s: Session = {
    ...input, id, name: input.name.trim() || `Session ${new Date().toLocaleDateString()}`,
    createdAt: now, updatedAt: now,
    datasets: [1, 2, 3].map((slot) => ({ slot, name: `Dataset ${slot}`, properties: [], excludedAfterEffective: 0 })),
    subject: null, widgets: {},
  }
  const all = read(); all[id] = s; write(all)
  return s
}
export async function saveSession(s: Session): Promise<void> {
  const all = read(); all[s.id] = { ...s, updatedAt: new Date().toISOString() }; write(all)
}
export async function deleteSession(id: string): Promise<void> {
  const all = read(); delete all[id]; write(all)
}
