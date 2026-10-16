import type { Listing } from '@/engines'
import { parseCsv } from './csv'

/** Column names a market export may use, normalized (lower-case letters and digits), in priority order. */
const ALIASES: Record<string, string[]> = {
  id: ['mlsnumber', 'mlsnum', 'listingid', 'id'],
  status: ['status', 'liststatus'],
  listDate: ['listdate', 'listingdate', 'onmarketdate'],
  origListPrice: ['originallistprice'],
  listPrice: ['listprice', 'lastlistprice', 'currentprice'],
  soldPrice: ['closeprice', 'soldprice', 'saleprice'],
  closeDate: ['closedate', 'solddate', 'closingdate'],
  contractDate: ['pendingdate', 'contractdate'],
  offMarketDate: ['offmarketdate'],
  withdrawnDate: ['withdrawndate'],
  expirationDate: ['expirationdate'],
  terminationDate: ['terminationdate'],
  gla: ['buildingsqft', 'gla', 'livingarea', 'sqft'],
  lotSize: ['lotsize', 'lotsqft'],
  yearBuilt: ['yearbuilt'],
  dom: ['dom', 'daysonmarket'],
  concessions: ['sellertobuyerclosingcosts', 'sellerconcessions', 'closingcosts'],
  special: ['specialconditions'],
  disclosures: ['disclosures'],
}
const REQUIRED = ['id', 'status', 'listDate']
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
const num = (s: string | undefined) => { const t = (s ?? '').replace(/[$,\s]/g, ''); const n = Number(t); return t === '' || !Number.isFinite(n) ? null : n }
const date = (s: string | undefined) => {
  const t = (s ?? '').trim()
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t)
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`
  return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null
}

export interface MarketImport { listings: Listing[]; missing: string[]; duplicates: number; skipped: number }

/** Read a market export. Every status is kept; nothing is filtered out except repeats of an MLS number. */
export function importMarketCsv(text: string, max = 10000): MarketImport {
  const rows = parseCsv(text.replace(/^﻿/, ''))
  if (rows.length < 2) return { listings: [], missing: REQUIRED, duplicates: 0, skipped: 0 }
  const header = rows[0].map(norm)
  const col: Record<string, number> = {}
  for (const [field, names] of Object.entries(ALIASES)) for (const n of names) { const i = header.indexOf(n); if (i >= 0) { col[field] = i; break } }
  const missing = REQUIRED.filter((f) => col[f] === undefined)
  if (missing.length) return { listings: [], missing, duplicates: 0, skipped: 0 }
  const out: Listing[] = []
  const seen = new Set<string>()
  let duplicates = 0
  let skipped = 0
  for (const r of rows.slice(1)) {
    const get = (f: string) => (col[f] === undefined ? undefined : r[col[f]])
    const id = (get('id') ?? '').trim()
    if (!id) { skipped++; continue }
    if (seen.has(id)) { duplicates++; continue }
    if (out.length >= max) { skipped++; continue }
    seen.add(id)
    out.push({
      id, status: (get('status') ?? '').trim(), listDate: date(get('listDate')), origListPrice: num(get('origListPrice')), listPrice: num(get('listPrice')),
      soldPrice: num(get('soldPrice')), closeDate: date(get('closeDate')), contractDate: date(get('contractDate')), offMarketDate: date(get('offMarketDate')),
      withdrawnDate: date(get('withdrawnDate')), expirationDate: date(get('expirationDate')), terminationDate: date(get('terminationDate')),
      gla: num(get('gla')), lotSize: num(get('lotSize')), yearBuilt: num(get('yearBuilt')), dom: num(get('dom')), concessions: num(get('concessions')),
      special: [get('special'), get('disclosures')].map((v) => (v ?? '').trim()).filter(Boolean).join('; '),
    })
  }
  return { listings: out, missing: [], duplicates, skipped }
}
