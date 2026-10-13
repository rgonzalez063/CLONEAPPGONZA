import type { StoredProperty } from './importer'

/** Deterministic SYNTHETIC properties for demos and tests. Not real sales. */
export function syntheticMarket(count: number, seedValue = 11, effective = '2026-10-09'): StoredProperty[] {
  let s = seedValue
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647
  const day0 = Date.parse(effective) - 365 * 86400000
  return Array.from({ length: count }, (_, i) => {
    const gla = Math.round(1100 + rnd() * 1100)
    const lot = Math.round(5000 + rnd() * 5000)
    const baths = rnd() < 0.5 ? 2 : rnd() < 0.7 ? 3 : 1
    const garage = rnd() < 0.5 ? 0 : rnd() < 0.7 ? 1 : 2
    const t = rnd()
    const price = Math.round(60000 + 45 * gla + 1.2 * lot + 6000 * baths + 2500 * garage + 8000 * t + (rnd() - 0.5) * 24000)
    const sale = new Date(day0 + t * 360 * 86400000).toISOString().slice(0, 10)
    return {
      id: `SYN${1000 + i}`, salePrice: price, saleDate: sale, contractDate: null, status: 'closed',
      values: { gla, lot_size: lot, baths_full: baths, garage, stories: 1, beds: 3 },
    }
  })
}
