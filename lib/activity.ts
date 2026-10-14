import { resolveFeature } from './features'
import type { StoredProperty } from './importer'
import { CANDIDATES, describeRule } from './pairedSettings'
import type { Session, WidgetState } from './types'

/** One thing the appraiser did. `detail` holds plain values only. */
export interface ActivityEvent { type: string; detail: Record<string, unknown>; at?: string }
export interface LoggedEvent { id: number; ts: string; type: string; detail: Record<string, unknown> }

const label = (key: string) => resolveFeature(key)?.label ?? key
const flat = (v: unknown) => (v === null || v === undefined ? 'empty' : String(v))
const MAX_EDITS = 30
const MAX_IDS = 10

function compareObjects(a: object | undefined, b: object | undefined, name = (k: string) => k): string[] {
  const x = (a ?? {}) as Record<string, unknown>
  const y = (b ?? {}) as Record<string, unknown>
  const out: string[] = []
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) out.push(`${name(k)}: ${flat(x[k])} to ${flat(y[k])}`)
  return out
}

function widgetEvents(key: string, was: WidgetState, now: WidgetState): ActivityEvent[] {
  const feature = label(key)
  const out: ActivityEvent[] = []
  if (was.chosen !== now.chosen) out.push(now.chosen === null ? { type: 'adjustment.cleared', detail: { feature, was: was.chosen } } : { type: 'adjustment.chosen', detail: { feature, value: now.chosen, was: was.chosen } })
  if (was.done !== now.done) out.push({ type: now.done ? 'feature.done' : 'feature.reopened', detail: { feature } })
  if (was.locked !== now.locked) out.push({ type: now.locked ? 'feature.locked' : 'feature.unlocked', detail: { feature } })
  if (was.model !== now.model) out.push({ type: now.model ? 'model.on' : 'model.off', detail: { feature } })
  if (was.low !== now.low || was.high !== now.high) out.push({ type: 'limits.changed', detail: { feature, low: now.low, high: now.high } })
  if (!!was.snip !== !!now.snip) out.push({ type: now.snip ? 'results.snipped' : 'results.snip_reset', detail: { feature } })
  if (JSON.stringify(was.comment) !== JSON.stringify(now.comment)) out.push({ type: 'comment.edited', detail: { feature } })
  if (was.subject !== now.subject) out.push({ type: 'subject.value_set', detail: { feature, value: now.subject ?? null } })
  return out
}

/**
 * What changed between two saved states of a session, as events. The save code calls this so that nearly
 * everything the appraiser does is logged without instrumenting each button.
 */
export function diffEvents(was: Session, now: Session, before: Map<number, Map<string, StoredProperty>>): ActivityEvent[] {
  const out: ActivityEvent[] = []
  if (was.name !== now.name) out.push({ type: 'session.renamed', detail: { from: was.name, to: now.name } })
  if (JSON.stringify(was.subject) !== JSON.stringify(now.subject) && now.subject) out.push({ type: 'subject.saved', detail: { address: now.subject.address } })

  const was_ = Object.keys(was.widgets)
  const now_ = Object.keys(now.widgets)
  for (const k of now_) if (!(k in was.widgets)) out.push({ type: 'feature.added', detail: { feature: label(k) } })
  for (const k of was_) if (!(k in now.widgets)) out.push({ type: 'feature.removed', detail: { feature: label(k) } })
  const kept = now_.filter((k) => k in was.widgets)
  if (JSON.stringify(was_.filter((k) => k in now.widgets)) !== JSON.stringify(kept)) out.push({ type: 'features.reordered', detail: { order: now_.map(label).join(', ') } })
  for (const k of kept) out.push(...widgetEvents(k, was.widgets[k], now.widgets[k]))

  const t = compareObjects(was.transactional, now.transactional)
  if (t.length && now.transactional) out.push({ type: 'settings.transactional', detail: { changes: t.join('; ') } })
  const pairedName = (k: string) => CANDIDATES.find((c) => c.key === k)?.label ?? k
  const pw = Object.keys(now.pairedSettings?.features ?? {}).flatMap((k) => {
    const a = was.pairedSettings?.features[k]
    const b = now.pairedSettings?.features[k]
    if (!b || JSON.stringify(a) === JSON.stringify(b)) return []
    const fmt = (f?: { enabled: boolean; rule: Parameters<typeof describeRule>[0] }) => (f ? (f.enabled ? describeRule(f.rule) : 'off') : 'default')
    return [`${pairedName(k)}: ${fmt(a)} to ${fmt(b)}`]
  })
  if (was.pairedSettings && now.pairedSettings && was.pairedSettings.removeOutliers !== now.pairedSettings.removeOutliers) pw.push(`outlier trim: ${was.pairedSettings.removeOutliers} to ${now.pairedSettings.removeOutliers}`)
  if (pw.length) out.push({ type: 'settings.paired_sales', detail: { changes: pw.slice(0, 12).join('; ') } })
  if (now.commentTransactional !== undefined && was.commentTransactional !== now.commentTransactional) out.push({ type: 'comment.setting', detail: { includeTransactionalSentence: now.commentTransactional } })

  for (const d of now.datasets) {
    const old = was.datasets.find((x) => x.slot === d.slot)
    const prior = before.get(d.slot) ?? new Map<string, StoredProperty>()
    const dataset = d.name
    if (old && old.name !== d.name) out.push({ type: 'dataset.renamed', detail: { from: old.name, to: d.name } })
    if (d.properties.length === 0 && prior.size > 0) { out.push({ type: 'dataset.cleared', detail: { dataset, sales: prior.size } }); continue }
    const nowIds = new Set(d.properties.map((p) => p.id))
    const added = d.properties.filter((p) => !prior.has(p.id))
    const dropped = [...prior.keys()].filter((id) => !nowIds.has(id))
    if (added.length) out.push({ type: 'dataset.sales_added', detail: { dataset, count: added.length } })
    if (dropped.length) out.push({ type: 'dataset.sales_dropped', detail: { dataset, count: dropped.length } })
    const removed: string[] = []
    const recovered: string[] = []
    let edits = 0
    for (const p of d.properties) {
      const a = prior.get(p.id)
      if (!a || a === p) continue
      if (!a.deleted && p.deleted) removed.push(p.id)
      if (a.deleted && !p.deleted) recovered.push(p.id)
      for (const f of new Set([...Object.keys(a.edits ?? {}), ...Object.keys(p.edits ?? {})])) {
        const x = a.edits?.[f]
        const y = p.edits?.[f]
        if (JSON.stringify(x) === JSON.stringify(y)) continue
        if (edits++ >= MAX_EDITS) continue
        out.push(y ? { type: 'sale.edited', detail: { dataset, mls: p.id, field: f, from: y.from, to: y.to } } : { type: 'sale.edit_undone', detail: { dataset, mls: p.id, field: f } })
      }
    }
    if (edits > MAX_EDITS) out.push({ type: 'sale.edited_more', detail: { dataset, more: edits - MAX_EDITS } })
    if (removed.length) out.push({ type: 'sales.removed', detail: { dataset, count: removed.length, mls: removed.slice(0, MAX_IDS).join(', ') + (removed.length > MAX_IDS ? ', …' : '') } })
    if (recovered.length) out.push({ type: 'sales.recovered', detail: { dataset, count: recovered.length, mls: recovered.slice(0, MAX_IDS).join(', ') + (recovered.length > MAX_IDS ? ', …' : '') } })
  }
  return out
}

// ------------------------------------------------------------------ how events read on screen
const TITLES: Record<string, string> = {
  'session.created': 'Session started', 'session.cloned': 'Session cloned', 'session.renamed': 'Session renamed',
  'subject.saved': 'Subject saved', 'subject.value_set': "Subject's value set",
  'feature.added': 'Feature added', 'feature.removed': 'Feature removed', 'features.reordered': 'Features reordered',
  'adjustment.chosen': 'Adjustment chosen', 'adjustment.cleared': 'Adjustment cleared',
  'feature.done': 'Marked done', 'feature.reopened': 'Reopened', 'feature.locked': 'Locked', 'feature.unlocked': 'Unlocked',
  'model.on': 'Modeling turned on', 'model.off': 'Modeling turned off', 'limits.changed': 'Limits changed',
  'results.snipped': 'Results snipped', 'results.snip_reset': 'Snip reset', 'comment.edited': 'Comment options changed', 'comment.setting': 'Comment setting changed',
  'settings.transactional': 'Transactional settings changed', 'settings.paired_sales': 'Paired sales settings changed',
  'dataset.renamed': 'Dataset renamed', 'dataset.cleared': 'Dataset cleared', 'dataset.sales_added': 'Sales added', 'dataset.sales_dropped': 'Sales dropped',
  'sale.edited': 'Sale edited', 'sale.edit_undone': 'Edit undone', 'sale.edited_more': 'More sales edited', 'sales.removed': 'Sales removed', 'sales.recovered': 'Sales recovered',
  'export.documents': 'Documents exported', 'export.workfile': 'Workfile exported', 'template.saved': 'Saved as a template', 'template.updated': 'Template updated',
}
export const eventTitle = (type: string) => TITLES[type] ?? type.replace(/[._]/g, ' ')

const money = (v: unknown) => (typeof v === 'number' ? `$${Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(2)}`.replace('$-', '-$') : flat(v))
export function eventDetail(type: string, d: Record<string, unknown>): string {
  switch (type) {
    case 'session.created': return `${flat(d.name)}${d.template && d.template !== 'Standard' ? ` (template ${flat(d.template)})` : ''}`
    case 'session.cloned': return `copied from ${flat(d.from)}`
    case 'session.renamed': return `${flat(d.from)} to ${flat(d.to)}`
    case 'subject.saved': return flat(d.address)
    case 'subject.value_set': return `${flat(d.feature)}: ${flat(d.value)}`
    case 'adjustment.chosen': return `${flat(d.feature)}: ${money(d.value)}${d.was !== null && d.was !== undefined ? ` (was ${money(d.was)})` : ''}`
    case 'adjustment.cleared': return `${flat(d.feature)} (was ${money(d.was)})`
    case 'limits.changed': return `${flat(d.feature)}: low ${d.low === null ? 'none' : money(d.low)}, high ${d.high === null ? 'none' : money(d.high)}`
    case 'settings.transactional': case 'settings.paired_sales': return flat(d.changes)
    case 'comment.setting': return `first sentence about transactional order: ${d.includeTransactionalSentence ? 'on' : 'off'}`
    case 'dataset.renamed': return `${flat(d.from)} to ${flat(d.to)}`
    case 'dataset.cleared': return `${flat(d.dataset)}: ${flat(d.sales)} sales`
    case 'dataset.sales_added': case 'dataset.sales_dropped': return `${flat(d.dataset)}: ${flat(d.count)}`
    case 'sale.edited': return `${flat(d.dataset)}, MLS ${flat(d.mls)}, ${flat(d.field)}: ${flat(d.from)} to ${flat(d.to)}`
    case 'sale.edit_undone': return `${flat(d.dataset)}, MLS ${flat(d.mls)}, ${flat(d.field)}`
    case 'sale.edited_more': return `${flat(d.dataset)}: ${flat(d.more)} more edits not listed`
    case 'sales.removed': case 'sales.recovered': return `${flat(d.dataset)}: ${flat(d.count)} (MLS ${flat(d.mls)})`
    case 'export.documents': return flat(d.documents)
    case 'template.saved': case 'template.updated': return flat(d.name)
    default: return d.feature ? flat(d.feature) : Object.entries(d).map(([k, v]) => `${k}: ${flat(v)}`).join(', ')
  }
}
