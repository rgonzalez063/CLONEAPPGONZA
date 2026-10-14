'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { StoredProperty } from '@/lib/importer'
import { COLUMNS, compare, matches, type Column } from '@/lib/propertyOps'

const ROW_H = 34
const VIEW_H = 560

export interface GridProps {
  rows: StoredProperty[]
  selected: Set<string>
  onSelect: (ids: Set<string>) => void
  onEdit: (id: string, col: Column, raw: string) => string | null // returns an error message, or null when saved
  onRevert: (id: string, col: Column) => void
  query: string
  label: string
}

const show = (v: number | string | null, col: Column) =>
  v === null ? '' : typeof v === 'number' && col.key === 'salePrice' ? `$${v.toLocaleString('en-US')}` : typeof v === 'number' ? v.toLocaleString('en-US') : v

export function PropertyGrid({ rows, selected, onSelect, onEdit, onRevert, query, label }: GridProps) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [top, setTop] = useState(0)
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const box = useRef<HTMLDivElement>(null)

  const view = useMemo(() => {
    const filtered = rows.filter((p) => matches(p, query))
    if (!sort) return filtered
    const col = COLUMNS.find((c) => c.key === sort.key)!
    return [...filtered].sort((a, b) => compare(col.get(a), col.get(b), sort.dir))
  }, [rows, query, sort])

  useEffect(() => { box.current?.scrollTo({ top: 0 }) }, [query, sort])

  const first = Math.max(0, Math.floor(top / ROW_H) - 8)
  const last = Math.min(view.length, Math.ceil((top + VIEW_H) / ROW_H) + 8)
  const allSelected = view.length > 0 && view.every((p) => selected.has(p.id))
  const template = `40px repeat(${COLUMNS.length}, minmax(96px, 1fr))`

  function start(p: StoredProperty, col: Column) {
    if (!col.editable) return
    setEditing({ id: p.id, key: col.key })
    setDraft(String(col.get(p) ?? ''))
    setError('')
  }
  function commit(p: StoredProperty, col: Column) {
    const msg = onEdit(p.id, col, draft)
    if (msg) { setError(msg); return }
    setEditing(null); setError('')
  }

  return (
    <div role="grid" aria-label={label} aria-rowcount={view.length + 1} className="rounded-md border border-border text-sm">
      <div role="row" className="grid border-b border-border bg-surface font-semibold" style={{ gridTemplateColumns: template }}>
        <div role="columnheader" className="flex items-center justify-center p-2">
          <input type="checkbox" aria-label="Select all shown rows" checked={allSelected}
            onChange={(e) => { const n = new Set(selected); for (const p of view) e.target.checked ? n.add(p.id) : n.delete(p.id); onSelect(n) }} />
        </div>
        {COLUMNS.map((c) => (
          <div key={c.key} role="columnheader" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
            <button type="button" className="w-full p-2 text-left" onClick={() => setSort(sort?.key === c.key ? { key: c.key, dir: sort.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 })}>
              {c.label}{sort?.key === c.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
            </button>
          </div>
        ))}
      </div>
      <div ref={box} className="overflow-auto" style={{ height: VIEW_H }} onScroll={(e) => setTop(e.currentTarget.scrollTop)}>
        <div style={{ height: view.length * ROW_H, position: 'relative' }}>
          {view.slice(first, last).map((p, i) => {
            const idx = first + i
            return (
              <div key={p.id} role="row" aria-rowindex={idx + 2} aria-selected={selected.has(p.id)}
                className={`grid items-center border-b border-border ${selected.has(p.id) ? 'bg-accent-soft' : ''}`}
                style={{ gridTemplateColumns: template, height: ROW_H, position: 'absolute', top: idx * ROW_H, left: 0, right: 0 }}>
                <div role="gridcell" className="flex justify-center">
                  <input type="checkbox" aria-label={`Select ${p.id}`} checked={selected.has(p.id)}
                    onChange={(e) => { const n = new Set(selected); e.target.checked ? n.add(p.id) : n.delete(p.id); onSelect(n) }} />
                </div>
                {COLUMNS.map((c) => {
                  const edited = !!p.edits?.[c.key]
                  const isEditing = editing?.id === p.id && editing.key === c.key
                  return (
                    <div key={c.key} role="gridcell" tabIndex={c.editable ? 0 : undefined}
                      aria-label={c.editable ? `${c.label}, ${show(c.get(p), c) || 'empty'}. Press Enter to edit.` : undefined}
                      className={`truncate px-2 ${edited ? 'font-semibold text-accent' : ''} ${c.editable ? 'cursor-text' : ''}`}
                      title={edited ? `Edited. Original: ${p.edits![c.key].from ?? 'empty'}` : undefined}
                      onDoubleClick={() => start(p, c)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !isEditing) { e.preventDefault(); start(p, c) } }}>
                      {isEditing ? (
                        <span className="flex items-center gap-1">
                          <input autoFocus aria-label={`Edit ${c.label} for ${p.id}`} aria-invalid={!!error} className="h-7 w-full min-w-0 rounded-sm border border-border-input px-1"
                            value={draft} onFocus={(e) => e.target.select()} onChange={(e) => setDraft(e.target.value)} onBlur={() => { setEditing(null); setError('') }}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(p, c) } else if (e.key === 'Escape') { setEditing(null); setError('') } }} />
                        </span>
                      ) : (
                        <>
                          {show(c.get(p), c)}
                          {edited && <button type="button" className="ml-1 text-xs text-text-muted underline" aria-label={`Undo edit of ${c.label} for ${p.id}`} onMouseDown={(e) => e.preventDefault()} onClick={() => onRevert(p.id, c)}>undo</button>}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border p-2 text-xs text-text-muted">
        <span>{view.length.toLocaleString('en-US')} of {rows.length.toLocaleString('en-US')} sales shown. Double-click a cell, or press Enter on it, to edit.</span>
        {error && <span role="alert" className="text-danger">{error}</span>}
      </div>
    </div>
  )
}
