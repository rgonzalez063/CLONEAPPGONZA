// Puts sales from this app into the comparable columns of a TOTAL report saved as XML.
// A column that already exists is updated in place; new columns are copied from the first comparable in the file, so the
// parts the app does not know (quality, condition, view, style...) start out as that comp's and must be reviewed in TOTAL.
import type { StoredProperty } from './importer'

export interface PlaceOptions { mlsName: string; effectiveDate: string; state: string }
export interface PlaceReport { xml: string; placed: { seq: number; id: string; address: string; created: boolean; distance: string }[]; warnings: string[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const unesc = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
function getAttr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)
  return m ? unesc(m[1]) : null
}
function setAttr(tag: string, name: string, value: string): string {
  const re = new RegExp(`((?:^|\\s)${name}=")[^"]*(")`)
  if (re.test(tag)) return tag.replace(re, (_, a: string, b: string) => `${a}${esc(value)}${b}`)
  return tag.replace(/(\s*\/?>)$/, ` ${name}="${esc(value)}"$1`)
}
function dropAttr(tag: string, name: string): string { return tag.replace(new RegExp(`\\s${name}="[^"]*"`), '') }
const editTag = (block: string, re: RegExp, fn: (tag: string) => string) => block.replace(re, (t) => fn(t))

const mmYY = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '')

// ------------------------------------------------------------------ small translations of MLS wording into UAD wording
export function financingOf(raw: string): { short: string; gse: string; other: string } {
  const t = raw.toLowerCase()
  if (/fha/.test(t)) return { short: 'FHA', gse: 'FHA', other: '' }
  if (/\bva\b|veteran/.test(t)) return { short: 'VA', gse: 'VA', other: '' }
  if (/usda|rural/.test(t)) return { short: 'RH', gse: 'USDA', other: '' }
  if (/cash/.test(t)) return { short: 'Cash', gse: 'Cash', other: '' }
  if (/conv/.test(t)) return { short: 'Conv', gse: 'Conventional', other: '' }
  if (/seller|owner|assum/.test(t)) return { short: 'Oth', gse: 'Other', other: raw }
  return raw ? { short: 'Oth', gse: 'Other', other: raw } : { short: 'Oth', gse: 'Other', other: '' }
}
export function saleTypeOf(special: string): { short: string; gse: string } {
  if (/short\s*sale/i.test(special)) return { short: 'ShortSale', gse: 'ShortSale' }
  if (/\bREO\b|real\s+estate\s+owned|foreclos|bank[\s-]?owned/i.test(special)) return { short: 'REO', gse: 'REOSale' }
  return { short: 'ArmLth', gse: 'ArmsLengthSale' }
}

/** Straight-line distance in miles and the compass direction from the subject, as the grid shows it ("0.38 miles NW"). */
export function proximity(from: [number, number] | null, to: [number, number] | null): string {
  if (!from || !to) return ''
  const R = 3958.8
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(to[0] - from[0])
  const dLon = rad(to[1] - from[1])
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from[0])) * Math.cos(rad(to[0])) * Math.sin(dLon / 2) ** 2
  const miles = 2 * R * Math.asin(Math.sqrt(a))
  const y = Math.sin(dLon) * Math.cos(rad(to[0]))
  const x = Math.cos(rad(from[0])) * Math.sin(rad(to[0])) - Math.sin(rad(from[0])) * Math.cos(rad(to[0])) * Math.cos(dLon)
  const bearing = (Math.atan2(y, x) * 180) / Math.PI
  const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((bearing + 360) % 360) / 45) % 8]
  return `${miles.toFixed(2)} miles ${dir}`
}

const pair = (a: string, b: string): [number, number] | null => { const x = Number(a); const y = Number(b); return a && b && Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null }

// ------------------------------------------------------------------ one comparable column
function fillColumn(block: string, seq: number, p: StoredProperty, subjectLoc: [number, number] | null, opt: PlaceOptions, warnings: string[]): { block: string; address: string; distance: string } {
  const t = p.text ?? {}
  const v = p.values
  const meta = p.meta ?? { concessions: 0, financing: '', special: '', ownership: '' }
  const num = (k: string) => v[k] ?? null
  const gla = num('gla')
  const street = (t.address ?? '').trim()
  const city = (t.city ?? '').trim()
  const zip = (t.zip ?? '').trim()
  if (!street) warnings.push(`MLS ${p.id} has no street address in the data; re-import the sales from the MLS file to include addresses.`)
  const dom = (t.dom ?? '').trim()
  const fin = financingOf(meta.financing)
  const type = saleTypeOf(meta.special)
  const loc = pair(t.lat ?? '', t.lng ?? '')
  const distance = proximity(subjectLoc, loc)
  const desc = `${opt.mlsName} #${p.id}${dom ? `;DOM ${dom}` : ''}`
  const baths = (num('baths_full') ?? 0) + (num('baths_half') ?? 0) * 0.5

  let out = block
  // the column's own header tag: price and source; any old totals are removed because they belonged to another sale
  out = out.replace(/^<COMPARABLE_SALE\b[^>]*>/, (open) => {
    let o = setAttr(open, 'PropertySequenceIdentifier', String(seq))
    o = setAttr(o, 'PropertySalesAmount', String(Math.round(p.salePrice)))
    if (gla) o = setAttr(o, 'SalesPricePerGrossLivingAreaAmount', (p.salePrice / gla).toFixed(2))
    o = setAttr(o, 'DataSourceDescription', desc)
    for (const a of ['SalesPriceTotalAdjustmentPositiveIndicator', 'SalePriceTotalAdjustmentAmount', 'AdjustedSalesPriceAmount', 'SalesPriceTotalAdjustmentGrossPercent', 'SalePriceTotalAdjustmentNetPercent']) o = dropAttr(o, a)
    return o
  })
  out = editTag(out, /<LOCATION\b[^>]*\/>/, (tag) => {
    let l = setAttr(tag, 'PropertyStreetAddress', street)
    l = setAttr(l, 'PropertyStreetAddress2', `${city}, ${opt.state} ${zip}`.trim())
    l = setAttr(l, 'PropertyState', opt.state)
    if (city) l = setAttr(l, 'PropertyCity', city)
    if (zip) l = setAttr(l, 'PropertyPostalCode', zip)
    if (loc) { l = setAttr(l, 'LatitudeNumber', String(loc[0])); l = setAttr(l, 'LongitudeNumber', String(loc[1])) }
    if (distance) l = setAttr(l, 'ProximityToSubjectDescription', distance)
    return l
  })
  out = editTag(out, /<ROOM_ADJUSTMENT\b[^>]*\/>/, (tag) => {
    let r = tag
    if (num('rooms') !== null) r = setAttr(r, 'TotalRoomCount', String(num('rooms')))
    if (num('beds') !== null) r = setAttr(r, 'TotalBedroomCount', String(num('beds')))
    r = setAttr(r, 'TotalBathroomCount', baths.toFixed(1))
    return setAttr(r, 'RoomAdjustmentAmount', '')
  })

  const car = (num('garage') ?? 0) > 0 ? `${num('garage')}ga` : (num('carport') ?? 0) > 0 ? '' : 'None'
  const descriptions: Record<string, string | null> = {
    SalesConcessions: type.short,
    FinancingConcessions: `${fin.short};${Math.round(meta.concessions)}`,
    DateOfSale: `s${mmYY(p.saleDate)};${p.contractDate ? `c${mmYY(p.contractDate)}` : 'Unk'}`,
    SiteArea: num('lot_size') !== null ? `${Math.round(num('lot_size')!)} sf` : null,
    Age: num('age') !== null ? String(num('age')) : null,
    GrossLivingArea: gla !== null ? String(Math.round(gla)) : null,
    CarStorage: `${car}${(num('carport') ?? 0) > 0 ? `${num('carport')}cp` : ''}` || null,
  }
  // every dollar amount in the column starts blank: the old ones belonged to a different sale
  out = out.replace(/<SALE_PRICE_ADJUSTMENT\b[^>]*\/>/g, (tag) => {
    let x = setAttr(tag, '_Amount', '')
    const type_ = getAttr(tag, '_Type') ?? ''
    const d = descriptions[type_]
    if (d !== undefined && d !== null) x = setAttr(x, '_Description', d)
    return x
  })
  out = out.replace(/<OTHER_FEATURE_ADJUSTMENT\b[^>]*\/>/g, (tag) => setAttr(tag, 'PropertyFeatureAdjustmentAmount', ''))

  out = editTag(out, /<COMPARISON_DETAIL\b[^>]*GSEDataSourceDescription[^>]*\/>|<COMPARISON_DETAIL\b[^>]*GSEDaysOnMarketDescription[^>]*\/>/, (tag) => {
    let d = setAttr(tag, 'GSEDataSourceDescription', `${opt.mlsName} #${p.id}`)
    d = setAttr(d, 'GSEDaysOnMarketDescription', dom || 'Unk')
    d = setAttr(d, 'GSESaleType', type.gse)
    d = setAttr(d, 'GSEFinancingType', fin.gse)
    d = setAttr(d, 'GSEFinancingTypeOtherDescription', fin.other)
    d = setAttr(d, 'GSEConcessionAmount', String(Math.round(meta.concessions)))
    d = setAttr(d, 'GSEListingStatusType', 'SettledSale')
    d = setAttr(d, 'GSEContractDateUnknownIndicator', p.contractDate ? 'N' : 'Y')
    return d
  })
  let n = 0
  out = out.replace(/<OFFERING_DISPOSITION\b[^>]*\/>/g, (tag) => {
    n++
    return n === 1 ? setAttr(tag, 'GSEShortDateDescription', mmYY(p.saleDate)) : n === 2 ? setAttr(tag, 'GSEShortDateDescription', mmYY(p.contractDate)) : tag
  })
  return { block: out, address: street, distance }
}

// ------------------------------------------------------------------ the whole report
export function placeComps(xml: string, picks: StoredProperty[], opt: PlaceOptions): PlaceReport {
  const warnings: string[] = []
  if (!/<SALES_COMPARISON\b/.test(xml) || !/<COMPARABLE_SALE\b/.test(xml)) throw new Error('This does not look like a TOTAL report saved as XML. In TOTAL, save or export the report as XML (UAD) and choose that file.')
  if (picks.length === 0) return { xml, placed: [], warnings: ['No sales were chosen.'] }

  const state = /<PROPERTY\b[^>]*_State="([A-Z]{2})"/.exec(xml)?.[1]
  if (state) opt = { ...opt, state }
  const blocks = xml.match(/<COMPARABLE_SALE\b[\s\S]*?<\/COMPARABLE_SALE>/g) ?? []
  const seqOf = (b: string) => Number(getAttr(/^<COMPARABLE_SALE\b[^>]*>/.exec(b)![0], 'PropertySequenceIdentifier') ?? -1)
  const subjectBlock = blocks.find((b) => seqOf(b) === 0)
  const subjLoc = subjectBlock ? pair(getAttr(/<LOCATION\b[^>]*\/>/.exec(subjectBlock)?.[0] ?? '', 'LatitudeNumber') ?? '', getAttr(/<LOCATION\b[^>]*\/>/.exec(subjectBlock)?.[0] ?? '', 'LongitudeNumber') ?? '') : null
  const template = blocks.find((b) => seqOf(b) >= 1)
  if (!template) throw new Error('The report has no comparable columns yet. In TOTAL, add at least one comparable to the sales comparison grid, save as XML again, and retry.')
  if (!subjLoc) warnings.push('The subject has no coordinates in the file, so the distance from the subject was left blank.')

  const existing = new Map(blocks.map((b) => [seqOf(b), b]))
  const placed: PlaceReport['placed'] = []
  const created: string[] = []
  picks.forEach((p, i) => {
    const seq = i + 1
    const base = existing.get(seq) ?? template
    const isNew = !existing.has(seq)
    const r = fillColumn(base, seq, p, subjLoc, opt, warnings)
    placed.push({ seq, id: p.id, address: r.address, created: isNew, distance: r.distance })
    if (existing.has(seq)) xml = xml.replace(existing.get(seq)!, () => r.block)
    else created.push(r.block)
  })
  if (created.length) {
    const endAt = xml.lastIndexOf('</COMPARABLE_SALE>') + '</COMPARABLE_SALE>'.length
    xml = xml.slice(0, endAt) + '\n      ' + created.join('\n      ') + xml.slice(endAt)
  }
  const leftovers = [...existing.keys()].filter((k) => k > picks.length)
  if (leftovers.length) warnings.push(`The file has ${leftovers.length} more comparable column${leftovers.length === 1 ? '' : 's'} than the sales you chose (columns ${leftovers.sort((a, b) => a - b).join(', ')}). They were left as they are; remove them in TOTAL if you do not want them.`)
  if (created.length) warnings.push(`${created.length} new column${created.length === 1 ? ' was' : 's were'} copied from comparable 1. Quality, condition, design, view, location, heating/cooling, amenities and the "other" feature lines come from that comp and are not known to this app: review them in TOTAL.`)
  return { xml, placed, warnings }
}
