import type { StoredProperty } from './importer'

/** The columns the property grid shows and lets the appraiser edit. */
export type ColumnType = 'text' | 'int' | 'num' | 'date'
export interface Column {
  key: string
  label: string
  type: ColumnType
  editable: boolean
  get: (p: StoredProperty) => number | string | null
}

const v = (k: string) => (p: StoredProperty) => p.values[k] ?? null
export const COLUMNS: Column[] = [
  { key: 'id', label: 'MLS #', type: 'text', editable: false, get: (p) => p.id },
  { key: 'salePrice', label: 'Sale price', type: 'int', editable: true, get: (p) => p.salePrice },
  { key: 'saleDate', label: 'Sale date', type: 'date', editable: true, get: (p) => p.saleDate },
  { key: 'contractDate', label: 'Contract date', type: 'date', editable: true, get: (p) => p.contractDate },
  { key: 'gla', label: 'GLA', type: 'int', editable: true, get: v('gla') },
  { key: 'lot_size', label: 'Lot size', type: 'int', editable: true, get: v('lot_size') },
  { key: 'baths_full', label: 'Full baths', type: 'int', editable: true, get: v('baths_full') },
  { key: 'baths_half', label: 'Half baths', type: 'int', editable: true, get: v('baths_half') },
  { key: 'beds', label: 'Beds', type: 'int', editable: true, get: v('beds') },
  { key: 'stories', label: 'Stories', type: 'num', editable: true, get: v('stories') },
  { key: 'garage', label: 'Garage', type: 'num', editable: true, get: v('garage') },
  { key: 'carport', label: 'Carport', type: 'num', editable: true, get: v('carport') },
  { key: 'fireplaces', label: 'Fireplaces', type: 'int', editable: true, get: v('fireplaces') },
  { key: 'age', label: 'Age', type: 'int', editable: true, get: v('age') },
]

export type EditResult = { ok: true; property: StoredProperty } | { ok: false; error: string }

const isIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'))

/** Validate and apply one cell edit. The first value a field had is kept as `from`, so edits can be reported and reverted. */
export function editProperty(p: StoredProperty, col: Column, raw: string): EditResult {
  if (!col.editable) return { ok: false, error: 'This column cannot be edited.' }
  const text = raw.trim()
  let next: number | string | null
  if (col.type === 'date') {
    if (text === '') {
      if (col.key === 'saleDate') return { ok: false, error: 'A sale date is required.' }
      next = null
    } else if (!isIso(text)) return { ok: false, error: 'Use the format yyyy-mm-dd.' }
    else next = text
  } else {
    if (text === '') {
      if (col.key === 'salePrice') return { ok: false, error: 'A sale price is required.' }
      next = null
    } else {
      const n = Number(text.replace(/[$,]/g, ''))
      if (!Number.isFinite(n)) return { ok: false, error: 'Enter a number.' }
      if (n < 0) return { ok: false, error: 'The value cannot be negative.' }
      if (col.key === 'salePrice' && n <= 0) return { ok: false, error: 'The sale price must be more than zero.' }
      if (col.type === 'int' && !Number.isInteger(n)) return { ok: false, error: 'Use a whole number.' }
      next = n
    }
  }
  const current = col.get(p)
  if (current === next) return { ok: true, property: p }
  const out: StoredProperty = { ...p, values: { ...p.values }, edits: { ...(p.edits ?? {}) } }
  if (col.key === 'salePrice') out.salePrice = next as number
  else if (col.key === 'saleDate') out.saleDate = next as string
  else if (col.key === 'contractDate') out.contractDate = next as string | null
  else out.values[col.key] = next as number | null
  const original = p.edits?.[col.key]?.from ?? current
  if (original === next) delete out.edits![col.key]
  else out.edits![col.key] = { from: original, to: next }
  if (Object.keys(out.edits!).length === 0) delete out.edits
  return { ok: true, property: out }
}

/** Put one edited field back to the value it had when the file was loaded. */
export function revertField(p: StoredProperty, col: Column): StoredProperty {
  const e = p.edits?.[col.key]
  if (!e) return p
  const r = editProperty(p, { ...col, editable: true }, e.from === null ? '' : String(e.from))
  return r.ok ? r.property : p
}

export function setDeleted(list: StoredProperty[], ids: Set<string>, deleted: boolean): StoredProperty[] {
  return list.map((p) => (ids.has(p.id) ? { ...p, deleted } : p))
}

export function compare(a: number | string | null, b: number | string | null, dir: 1 | -1): number {
  if (a === null && b === null) return 0
  if (a === null) return 1 // empty values sort last in either direction
  if (b === null) return -1
  return (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))) * dir
}

export function matches(p: StoredProperty, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  // Match what is shown on screen (1,500 and $210,000) as well as the raw value (1500).
  return COLUMNS.some((c) => {
    const v = c.get(p)
    if (v === null) return false
    const shown = typeof v === 'number' ? `${v} ${v.toLocaleString('en-US')} $${v.toLocaleString('en-US')}` : v
    return shown.toLowerCase().includes(t)
  })
}
