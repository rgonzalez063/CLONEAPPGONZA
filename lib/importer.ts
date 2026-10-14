import { parseCsv } from './csv'
import { groupFlags } from './groups'

export interface StoredProperty {
  id: string // MLS number
  salePrice: number
  saleDate: string // yyyy-mm-dd
  contractDate: string | null
  status: string
  values: Record<string, number | null>
  meta?: { concessions: number; financing: string; special: string; ownership: string }
  text?: Record<string, string> // source text columns used by feature groups
  deleted?: boolean
  edits?: Record<string, { from: number | string | null; to: number | string | null }> // field -> original and current
}

/**
 * Column aliases, normalized (lower-case, letters and digits only), in priority order.
 * Verified against a real HARMLS custom export. Other MLS systems get their own template later.
 */
const ALIASES: Record<string, string[]> = {
  id: ['mlsnumber', 'mlsnum', 'listingid', 'id'],
  salePrice: ['closeprice', 'soldprice', 'saleprice', 'sellingprice'],
  saleDate: ['closedate', 'solddate', 'saledate', 'closingdate'],
  contractDate: ['contractdate', 'pendingdate', 'purchasecontractdate'],
  status: ['status', 'liststatus'],
  gla: ['buildingsqft', 'gla', 'livingarea', 'squarefeet', 'sqft'],
  lot_size: ['lotsize', 'lotsqft', 'lotsizesqft'],
  baths_full: ['bathsfull', 'fullbaths', 'fullbath'],
  baths_half: ['bathshalf', 'halfbaths', 'halfbath'],
  garage: ['noofgaragecap', 'garagespaces', 'garagecapacity', 'garage'],
  carport: ['carportspacescount', 'carportspaces'],
  stories: ['stories', 'numberofunitstories', 'buildingstories'],
  beds: ['bedrooms', 'beds', 'bedroomstotal'],
  pool: ['poolprivate'],
  concessions: ['sellertobuyerclosingcosts', 'sellerconcessions', 'closingcosts'],
  financing: ['soldterms'],
  special: ['specialconditions'],
  disclosures: ['disclosures'],
  ownership: ['ownership', 'propertyrights'],
  year_built: ['yearbuilt'],
  fireplaces: ['fireplacesnumber'],
  rooms: ['roomcount', 'totalrooms'],
  hoa: ['maintenancefeeyesno', 'hoamandatory'],
  garage_desc: ['garagedesc'],
  style: ['style'],
  water_sewer: ['watersewer'],
  cool: ['coolsystem'],
  heat: ['heatsystem'],
  exterior: ['exterior'],
  energy: ['energy'],
}
const REQUIRED = ['id', 'salePrice', 'saleDate', 'gla']

/**
 * Special conditions as the transactional filters read them. A disclosure of "Real Estate Owned" with a cash sale counts as REO:
 * in the two real sessions checked, Synapse dropped the one such sale and kept two with the disclosure but a financed sale.
 * (Synapse may be reading public records for this; the properties grid can put a dropped sale back.)
 */
function specialConditions(special: string | undefined, disclosures: string | undefined, terms: string | undefined): string {
  const out = (special ?? '').trim()
  const reo = /real\s+estate\s+owned/i.test(disclosures ?? '') && /cash/i.test(terms ?? '')
  return reo ? [out, 'REO'].filter(Boolean).join('; ') : out
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function toNumber(s: string | undefined): number | null {
  if (s === undefined) return null
  const t = s.replace(/[$,\s]/g, '')
  const n = Number(t)
  return t === '' || !Number.isFinite(n) ? null : n
}

function toIso(s: string | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null
}

export interface ImportResult {
  properties: StoredProperty[]
  missingFields: string[]
  excludedAfterEffective: number
  excludedNotSold: number
  skippedRows: number
}

export function importCsv(text: string, effectiveDate: string): ImportResult {
  const rows = parseCsv(text.replace(/^﻿/, ''))
  const empty: ImportResult = { properties: [], missingFields: [], excludedAfterEffective: 0, excludedNotSold: 0, skippedRows: 0 }
  if (rows.length < 2) return { ...empty, missingFields: REQUIRED }
  const header = rows[0].map(norm)
  const col: Record<string, number> = {}
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const n of names) {
      const i = header.indexOf(n)
      if (i >= 0) { col[field] = i; break }
    }
  }
  const missing = REQUIRED.filter((f) => col[f] === undefined)
  if (missing.length) return { ...empty, missingFields: missing }

  const out: ImportResult = { ...empty, properties: [] }
  const seen = new Set<string>()
  for (const r of rows.slice(1)) {
    const get = (f: string) => (col[f] === undefined ? undefined : r[col[f]])
    const status = (get('status') ?? 'closed').toLowerCase()
    if (col.status !== undefined && !/(closed|sold)/.test(status)) { out.excludedNotSold++; continue }
    const id = (get('id') ?? '').trim()
    const price = toNumber(get('salePrice'))
    const saleDate = toIso(get('saleDate'))
    if (!id || price === null || price <= 0 || !saleDate || seen.has(id)) { out.skippedRows++; continue }
    if (saleDate > effectiveDate) { out.excludedAfterEffective++; continue }
    seen.add(id)
    const values: Record<string, number | null> = {}
    for (const k of ['gla', 'lot_size', 'baths_full', 'baths_half', 'garage', 'carport', 'stories', 'beds']) values[k] = toNumber(get(k))
    // A blank count field in the MLS means none, not unknown.
    for (const k of ['baths_half', 'carport']) if (values[k] === null) values[k] = 0
    values.fireplaces = toNumber(get('fireplaces')) ?? 0
    values.rooms = toNumber(get('rooms'))
    const yb = toNumber(get('year_built'))
    values.age = yb ? Number(effectiveDate.slice(0, 4)) - yb : null
    values.year_built = yb || null
    const yesNo = (v: string | undefined) => { const t = (v ?? '').trim().toLowerCase(); return t === 'true' || t === 'yes' ? 1 : t === 'false' || t === 'no' ? 0 : null }
    values.pool = yesNo(get('pool'))
    values.hoa = yesNo(get('hoa'))
    const gd = get('garage_desc') ?? ''
    values.garage_attached = /attached/i.test(gd) && !/^attached\/detached/i.test(gd) ? 1 : /attached\/detached/i.test(gd) ? 1 : 0
    values.garage_detached = /detached/i.test(gd) ? 1 : 0
    values.garage_builtin = /built-?in/i.test(gd) ? 1 : 0
    const code = (t: string | undefined) => { const v = (t ?? '').trim(); if (!v) return null; let h = 7; for (const c of v.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) % 1000003; return h }
    values.style_code = code(get('style'))
    const ws = (get('water_sewer') ?? '').toLowerCase()
    values.public_sewer = ws ? (ws.includes('public sewer') ? 1 : 0) : null
    values.public_water = ws ? (ws.includes('public water') ? 1 : 0) : null
    const text = { cool: get('cool') ?? '', heat: get('heat') ?? '', exterior: get('exterior') ?? '', energy: get('energy') ?? '' }
    Object.assign(values, groupFlags(text))
    out.properties.push({
      id, salePrice: price, saleDate, contractDate: toIso(get('contractDate')), status, values,
      text,
      meta: {
        concessions: toNumber(get('concessions')) ?? 0, financing: (get('financing') ?? '').trim(),
        special: specialConditions(get('special'), get('disclosures'), get('financing')),
        ownership: (get('ownership') ?? '').trim(),
      },
    })
  }
  return out
}
