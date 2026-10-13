import { parseCsv } from './csv'

export interface StoredProperty {
  id: string // MLS number
  salePrice: number
  saleDate: string // yyyy-mm-dd
  contractDate: string | null
  status: string
  values: Record<string, number | null>
  deleted?: boolean
}

/**
 * Column aliases (lower-case, punctuation removed). These are generic guesses.
 * The per-MLS template and mapping screen replaces this once a real export is available.
 */
const ALIASES: Record<string, string[]> = {
  id: ['mls', 'mlsnumber', 'mlsnum', 'listingid', 'id'],
  salePrice: ['closeprice', 'soldprice', 'saleprice', 'sellingprice'],
  saleDate: ['closedate', 'solddate', 'saledate', 'closingdate'],
  contractDate: ['contractdate', 'pendingdate', 'purchasecontractdate'],
  status: ['status', 'liststatus'],
  gla: ['gla', 'sqft', 'livingarea', 'buildingsqft', 'squarefeet'],
  lot_size: ['lotsize', 'lotsqft', 'lotsizesqft', 'lotsizeacres'],
  baths_full: ['bathsfull', 'fullbaths', 'fullbath'],
  garage: ['garagespaces', 'garage', 'garagecapacity'],
  stories: ['stories', 'numberofstories'],
  beds: ['beds', 'bedrooms', 'bedroomstotal'],
}
const REQUIRED = ['id', 'salePrice', 'saleDate', 'gla']

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function toNumber(s: string | undefined): number | null {
  if (s === undefined) return null
  const n = Number(s.replace(/[$,\s]/g, ''))
  return s.trim() === '' || !Number.isFinite(n) ? null : n
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
  const rows = parseCsv(text)
  const empty: ImportResult = { properties: [], missingFields: [], excludedAfterEffective: 0, excludedNotSold: 0, skippedRows: 0 }
  if (rows.length < 2) return { ...empty, missingFields: REQUIRED }
  const header = rows[0].map(norm)
  const col: Record<string, number> = {}
  for (const [field, names] of Object.entries(ALIASES)) {
    const i = header.findIndex((h) => names.includes(h))
    if (i >= 0) col[field] = i
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
    for (const k of ['gla', 'lot_size', 'baths_full', 'garage', 'stories', 'beds']) values[k] = toNumber(get(k))
    out.properties.push({ id, salePrice: price, saleDate, contractDate: toIso(get('contractDate')), status, values })
  }
  return out
}
