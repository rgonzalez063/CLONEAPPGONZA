/**
 * Feature groups: a text column from the MLS export split into named options.
 * Option labels and the patterns that find them are our own wording. A property that matches
 * none of a group's options counts as "None" for that group.
 */
export interface GroupDef {
  id: string
  label: string
  source: 'cool' | 'heat' | 'exterior' | 'energy' | 'lotdesc' | 'interior' | 'amenities'
  options: { label: string; re: RegExp }[]
}

export const GROUPS: GroupDef[] = [
  { id: 'cooling', label: 'Cooling', source: 'cool', options: [
    { label: 'Central', re: /central/i }, { label: 'Window unit', re: /window/i }, { label: 'None', re: /no cooling/i }] },
  { id: 'heating', label: 'Heating', source: 'heat', options: [
    { label: 'Central', re: /central/i }, { label: 'Window unit', re: /window/i }, { label: 'None', re: /no heating/i }] },
  { id: 'fencing', label: 'Fencing', source: 'exterior', options: [
    { label: 'Backyard fenced', re: /back\s*yard fenced/i }, { label: 'Fully fenced', re: /fully fenced/i }, { label: 'Partially fenced', re: /partial\w* fenced/i }] },
  { id: 'patios', label: 'Patios', source: 'exterior', options: [
    { label: 'Covered patio or deck', re: /covered patio/i }, { label: 'Patio or deck', re: /(^|,\s*)patio\/deck/i },
    { label: 'Porch', re: /porch/i }, { label: 'Balcony or terrace', re: /balcony|terrace/i }, { label: 'Rooftop deck', re: /rooftop/i }] },
  { id: 'exterior', label: 'Exterior features', source: 'exterior', options: [
    { label: 'Outdoor kitchen', re: /outdoor kitchen/i }, { label: 'Storage', re: /storage/i }, { label: 'Tennis', re: /tennis/i },
    { label: 'Workshop', re: /workshop/i }, { label: 'Detached quarters', re: /(guest|detached|separate)\s*(house|quarters|living|dwelling)|casita|mother-in-law/i }] },
  { id: 'energy', label: 'Energy efficient', source: 'energy', options: [
    { label: 'Windows', re: /window/i }, { label: 'High-efficiency HVAC', re: /high-efficiency/i }, { label: 'Programmable thermostat', re: /thermostat/i }] },
  { id: 'lot', label: 'Lot description', source: 'lotdesc', options: [
    { label: 'Cul-de-sac', re: /cul[\s-]*de[\s-]*sac/i }, { label: 'Corner', re: /corner/i }, { label: 'Wooded', re: /wooded|trees/i },
    { label: 'Greenbelt', re: /greenbelt/i }, { label: 'Golf course', re: /golf/i }, { label: 'Waterfront', re: /waterfront|lake|canal|pond/i }, { label: 'Ravine or creek', re: /ravine|creek/i }] },
  { id: 'interior', label: 'Interior features', source: 'interior', options: [
    { label: 'High or vaulted ceilings', re: /high ceiling|vaulted|cathedral/i }, { label: 'Wet bar', re: /wet bar/i },
    { label: 'Elevator', re: /elevator/i }, { label: 'Wine storage', re: /wine/i }, { label: 'Crown molding', re: /crown/i }, { label: 'Formal entry', re: /formal entry|foyer/i }] },
  { id: 'community', label: 'Community amenities', source: 'amenities', options: [
    { label: 'Community pool', re: /pool/i }, { label: 'Clubhouse', re: /clubhouse/i }, { label: 'Tennis court', re: /tennis/i },
    { label: 'Playground', re: /playground/i }, { label: 'Park or trails', re: /park|trail|jogging/i }, { label: 'Gated', re: /gated|guard/i }] },
]

export const groupKey = (group: string, option: string) => `grp:${group}:${option}`
export const compareKey = (group: string, a: string, b: string) => `cmp:${group}:${a}|${b}`

/** Flags (1 or 0) for every option of every group, given the property's source texts. */
export function groupFlags(text: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const g of GROUPS) {
    const t = text[g.source] ?? ''
    let any = false
    for (const o of g.options) {
      if (o.label === 'None') continue
      const hit = o.re.test(t)
      out[groupKey(g.id, o.label)] = hit ? 1 : 0
      any = any || hit
    }
    const noneRe = g.options.find((o) => o.label === 'None')?.re
    out[groupKey(g.id, 'None')] = !any && (t.trim() === '' || (noneRe ? noneRe.test(t) : true)) ? 1 : 0
    // Treat an explicit "no cooling/heating" as None even when another word matched.
    if (noneRe && noneRe.test(t)) out[groupKey(g.id, 'None')] = 1
  }
  return out
}

export function groupOptions(group: GroupDef): string[] {
  return group.options.map((o) => o.label).concat(group.options.some((o) => o.label === 'None') ? [] : ['None'])
}
