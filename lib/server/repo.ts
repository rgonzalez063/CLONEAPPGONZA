import type { StoredProperty } from '../importer'
import type { Dataset, Session, SessionSummary, Subject, Template, TemplateFeature, TemplateSettings, WidgetState } from '../types'
import type { Queryable } from './db'

/**
 * Data access. Every function takes the signed-in user's id and scopes every query by it,
 * so one user can never read or change another user's rows. Tests prove it.
 */
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d))
const day = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))

interface SessionRow {
  id: string; name: string; state: string; mls: string; property_type: string; template_id: string | null; effective_date: unknown
  settings: Session['transactional'] extends never ? never : { transactional?: Session['transactional']; pairedSettings?: Session['pairedSettings']; commentTransactional?: boolean; template?: string }
  subject: Subject | null; widgets: Record<string, WidgetState>; widget_order: string[]; data_version: number; favorite: boolean; created_at: unknown; updated_at: unknown
}

/** jsonb loses key order, so the saved order is applied when reading. Keys missing from the order go last. */
function inOrder(widgets: Record<string, WidgetState> | null, order: string[] | null): Record<string, WidgetState> {
  const w = widgets ?? {}
  const out: Record<string, WidgetState> = {}
  for (const k of order ?? []) if (k in w) out[k] = w[k]
  for (const k of Object.keys(w)) if (!(k in out)) out[k] = w[k]
  return out
}

function sessionFromRow(r: SessionRow, datasets: Dataset[]): Session {
  return {
    id: r.id, name: r.name, state: r.state, mls: r.mls, propertyType: r.property_type, template: r.settings?.template ?? 'Standard',
    templateId: r.template_id ?? undefined, effectiveDate: day(r.effective_date), createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
    datasets, subject: r.subject, widgets: inOrder(r.widgets, r.widget_order), transactional: r.settings?.transactional, pairedSettings: r.settings?.pairedSettings,
    commentTransactional: r.settings?.commentTransactional, dataVersion: r.data_version,
  }
}

// ------------------------------------------------------------------ sessions
export async function listSessions(q: Queryable, userId: string): Promise<SessionSummary[]> {
  const r = await q.query<SessionRow>('select id, name, mls, property_type, effective_date, updated_at, favorite from sessions where user_id = $1 order by updated_at desc limit 500', [userId])
  return r.rows.map((x) => ({ id: x.id, name: x.name, mls: x.mls, propertyType: x.property_type, effectiveDate: day(x.effective_date), updatedAt: iso(x.updated_at), favorite: x.favorite }))
}

interface PropRow {
  mls_number: string; sale_price: number; sale_date: unknown; contract_date: unknown; status: string
  vals: Record<string, number | null>; meta: StoredProperty['meta'] | null; src_text: Record<string, string> | null; deleted: boolean; edits: StoredProperty['edits'] | null; slot: number
}

export async function getSession(q: Queryable, userId: string, id: string): Promise<Session | null> {
  const s = await q.query<SessionRow>('select * from sessions where id = $1 and user_id = $2', [id, userId])
  if (!s.rows[0]) return null
  const ds = await q.query<{ id: string; slot: number; name: string; excluded_after_effective: number }>('select id, slot, name, excluded_after_effective from datasets where session_id = $1 order by slot', [id])
  const props = await q.query<PropRow>(
    'select p.mls_number, p.sale_price, p.sale_date, p.contract_date, p.status, p.vals, p.meta, p.src_text, p.deleted, p.edits, d.slot from properties p join datasets d on d.id = p.dataset_id where d.session_id = $1 order by d.slot, p.mls_number', [id])
  const bySlot = new Map<number, StoredProperty[]>()
  for (const p of props.rows) {
    const sp: StoredProperty = {
      id: p.mls_number, salePrice: p.sale_price, saleDate: day(p.sale_date), contractDate: p.contract_date ? day(p.contract_date) : null, status: p.status, values: p.vals,
      ...(p.meta ? { meta: p.meta } : {}), ...(p.src_text ? { text: p.src_text } : {}), ...(p.deleted ? { deleted: true } : {}), ...(p.edits ? { edits: p.edits } : {}),
    }
    const list = bySlot.get(p.slot) ?? []
    list.push(sp)
    bySlot.set(p.slot, list)
  }
  const datasets: Dataset[] = ds.rows.map((d) => ({ slot: d.slot, name: d.name, excludedAfterEffective: d.excluded_after_effective, properties: bySlot.get(d.slot) ?? [] }))
  return sessionFromRow(s.rows[0], datasets)
}

export interface NewSession { name: string; state: string; mls: string; propertyType: string; template: string; effectiveDate: string; templateId?: string }

export async function createSession(q: Queryable, userId: string, input: NewSession): Promise<Session> {
  const tpl = input.templateId ? await getTemplate(q, userId, input.templateId) : null
  const settings = { ...(tpl?.settings ?? {}), template: tpl?.name ?? input.template }
  const widgets: Record<string, WidgetState> = {}
  for (const f of tpl?.features ?? []) {
    widgets[f.key] = { chosen: null, done: false, locked: false, model: false, low: null, high: null, ...(f.comment ? { comment: f.comment } : {}) }
  }
  const name = input.name.trim() || `Session ${new Date().toISOString().slice(0, 10)}`
  const r = await q.query<{ id: string }>(
    `insert into sessions (user_id, template_id, name, state, mls, property_type, effective_date, settings, widgets, widget_order)
     values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb) returning id`,
    [userId, tpl?.id ?? null, name, input.state, input.mls, input.propertyType, input.effectiveDate, JSON.stringify(settings), JSON.stringify(widgets), JSON.stringify(Object.keys(widgets))])
  const id = r.rows[0].id
  for (let slot = 1; slot <= 3; slot++) {
    await q.query('insert into datasets (session_id, slot, name) values ($1, $2, $3)', [id, slot, tpl?.datasetNames[slot - 1] || `Dataset ${slot}`])
  }
  return (await getSession(q, userId, id))!
}

export interface SessionPatch {
  name?: string; effectiveDate?: string; subject?: Subject | null; widgets?: Record<string, WidgetState>
  transactional?: Session['transactional']; pairedSettings?: Session['pairedSettings']; commentTransactional?: boolean; dataVersion?: number; favorite?: boolean
  hasSettings?: boolean // true when any of transactional / pairedSettings / commentTransactional is being replaced
}

export async function patchSession(q: Queryable, userId: string, id: string, p: SessionPatch): Promise<boolean> {
  const cur = await q.query<{ settings: Record<string, unknown> }>('select settings from sessions where id = $1 and user_id = $2', [id, userId])
  if (!cur.rows[0]) return false
  const settings = { ...cur.rows[0].settings }
  if ('transactional' in p) settings.transactional = p.transactional
  if ('pairedSettings' in p) settings.pairedSettings = p.pairedSettings
  if ('commentTransactional' in p) settings.commentTransactional = p.commentTransactional
  await q.query(
    `update sessions set
       name = coalesce($3, name), effective_date = coalesce($4::date, effective_date),
       subject = case when $5::boolean then $6::jsonb else subject end,
       widgets = coalesce($7::jsonb, widgets), widget_order = coalesce($11::jsonb, widget_order), settings = $8::jsonb,
       data_version = coalesce($9, data_version), favorite = coalesce($10, favorite), updated_at = now()
     where id = $1 and user_id = $2`,
    [id, userId, p.name ?? null, p.effectiveDate ?? null, 'subject' in p, 'subject' in p ? JSON.stringify(p.subject ?? null) : null,
     p.widgets ? JSON.stringify(p.widgets) : null, JSON.stringify(settings), p.dataVersion ?? null, p.favorite ?? null, p.widgets ? JSON.stringify(Object.keys(p.widgets)) : null])
  return true
}

export async function deleteSession(q: Queryable, userId: string, id: string): Promise<boolean> {
  const r = await q.query('delete from sessions where id = $1 and user_id = $2 returning id', [id, userId])
  return r.rows.length > 0
}

// ------------------------------------------------------------------ datasets and properties
export interface DatasetPatch { name?: string; excludedAfterEffective?: number; clear?: boolean; upsert?: StoredProperty[]; remove?: string[] }

export async function patchDataset(q: Queryable, userId: string, sessionId: string, slot: number, p: DatasetPatch): Promise<boolean> {
  const d = await q.query<{ id: string }>(
    'select d.id from datasets d join sessions s on s.id = d.session_id where s.id = $1 and s.user_id = $2 and d.slot = $3', [sessionId, userId, slot])
  const datasetId = d.rows[0]?.id
  if (!datasetId) return false
  await q.query('update datasets set name = coalesce($2, name), excluded_after_effective = coalesce($3, excluded_after_effective) where id = $1', [datasetId, p.name ?? null, p.excludedAfterEffective ?? null])
  if (p.clear) await q.query('delete from properties where dataset_id = $1', [datasetId])
  if (p.remove?.length) await q.query('delete from properties where dataset_id = $1 and mls_number = any($2::text[])', [datasetId, p.remove])
  const rows = p.upsert ?? []
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((x) => ({
      mls_number: x.id, sale_price: Math.round(x.salePrice), sale_date: x.saleDate, contract_date: x.contractDate ?? null, status: x.status || 'closed',
      vals: x.values ?? {}, meta: x.meta ?? null, src_text: x.text ?? null, deleted: !!x.deleted, edits: x.edits ?? null,
    }))
    await q.query(
      `insert into properties (dataset_id, mls_number, sale_price, sale_date, contract_date, status, vals, meta, src_text, deleted, edits)
       select $1, r.mls_number, r.sale_price, r.sale_date::date, r.contract_date::date, r.status, r.vals, r.meta, r.src_text, r.deleted, r.edits
       from jsonb_to_recordset($2::jsonb) as r(mls_number text, sale_price integer, sale_date text, contract_date text, status text, vals jsonb, meta jsonb, src_text jsonb, deleted boolean, edits jsonb)
       on conflict (dataset_id, mls_number) do update set
         sale_price = excluded.sale_price, sale_date = excluded.sale_date, contract_date = excluded.contract_date, status = excluded.status,
         vals = excluded.vals, meta = excluded.meta, src_text = excluded.src_text, deleted = excluded.deleted, edits = excluded.edits`,
      [datasetId, JSON.stringify(chunk)])
  }
  await q.query('update sessions set updated_at = now() where id = $1 and user_id = $2', [sessionId, userId])
  return true
}

// ------------------------------------------------------------------ templates
interface TemplateRow {
  id: string; name: string; state: string; mls: string; property_type: string; is_default: boolean
  settings: TemplateSettings; features: TemplateFeature[]; dataset_names: string[]; created_at: unknown; updated_at: unknown
}
const tpl = (r: TemplateRow): Template => ({
  id: r.id, name: r.name, state: r.state, mls: r.mls, propertyType: r.property_type, isDefault: r.is_default,
  settings: r.settings ?? {}, features: r.features ?? [], datasetNames: r.dataset_names ?? [], createdAt: iso(r.created_at), updatedAt: iso(r.updated_at),
})

export async function listTemplates(q: Queryable, userId: string, filter?: { mls?: string; propertyType?: string }): Promise<Template[]> {
  const r = await q.query<TemplateRow>(
    'select * from templates where user_id = $1 and ($2::text is null or mls = $2) and ($3::text is null or property_type = $3) order by is_default desc, name', [userId, filter?.mls ?? null, filter?.propertyType ?? null])
  return r.rows.map(tpl)
}
export async function getTemplate(q: Queryable, userId: string, id: string): Promise<Template | null> {
  const r = await q.query<TemplateRow>('select * from templates where id = $1 and user_id = $2', [id, userId])
  return r.rows[0] ? tpl(r.rows[0]) : null
}

export type TemplateInput = Pick<Template, 'name' | 'state' | 'mls' | 'propertyType' | 'settings' | 'features' | 'datasetNames'> & { isDefault?: boolean }

export async function createTemplate(q: Queryable, userId: string, t: TemplateInput): Promise<Template> {
  if (t.isDefault) await q.query('update templates set is_default = false where user_id = $1 and mls = $2 and property_type = $3', [userId, t.mls, t.propertyType])
  const r = await q.query<TemplateRow>(
    `insert into templates (user_id, name, state, mls, property_type, settings, features, dataset_names, is_default)
     values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9) returning *`,
    [userId, t.name, t.state, t.mls, t.propertyType, JSON.stringify(t.settings), JSON.stringify(t.features), JSON.stringify(t.datasetNames), !!t.isDefault])
  return tpl(r.rows[0])
}

export async function updateTemplate(q: Queryable, userId: string, id: string, t: Partial<TemplateInput>): Promise<Template | null> {
  const cur = await getTemplate(q, userId, id)
  if (!cur) return null
  if (t.isDefault) await q.query('update templates set is_default = false where user_id = $1 and mls = $2 and property_type = $3 and id <> $4', [userId, cur.mls, cur.propertyType, id])
  const r = await q.query<TemplateRow>(
    `update templates set name = $3, settings = $4::jsonb, features = $5::jsonb, dataset_names = $6::jsonb, is_default = $7, updated_at = now()
     where id = $1 and user_id = $2 returning *`,
    [id, userId, t.name ?? cur.name, JSON.stringify(t.settings ?? cur.settings), JSON.stringify(t.features ?? cur.features), JSON.stringify(t.datasetNames ?? cur.datasetNames), t.isDefault ?? cur.isDefault])
  return tpl(r.rows[0])
}
export async function deleteTemplate(q: Queryable, userId: string, id: string): Promise<boolean> {
  return (await q.query('delete from templates where id = $1 and user_id = $2 returning id', [id, userId])).rows.length > 0
}

// ------------------------------------------------------------------ users
export async function deleteUser(q: Queryable, userId: string): Promise<void> {
  await q.query('delete from users where id = $1', [userId])
}
