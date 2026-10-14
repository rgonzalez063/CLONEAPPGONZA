'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { DropZone } from '@/components/DropZone'
import { Button } from '@/components/ui'
import { importCsv } from '@/lib/importer'
import { syntheticMarket } from '@/lib/seed'
import { getSession, saveSession, type Dataset, type Session } from '@/lib/store'
import { mean } from '@/engines'

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`

function Stats({ d }: { d: Dataset }) {
  const live = d.properties.filter((p) => !p.deleted)
  if (!live.length) return null
  const prices = live.map((p) => p.salePrice)
  const dates = live.map((p) => p.saleDate).sort()
  const rows: [string, string][] = [
    ['Sold properties', String(live.length)], ['Lowest sale price', usd(Math.min(...prices))],
    ['Oldest sale date', dates[0]], ['Average sale price', usd(mean(prices))],
    ['Newest sale date', dates[dates.length - 1]], ['Highest sale price', usd(Math.max(...prices))],
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      {rows.map(([k, v]) => (<div key={k}><dt className="text-text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>))}
      {d.excludedAfterEffective > 0 && <p className="col-span-2 text-text-muted">{d.excludedAfterEffective} sales after the effective date were left out.</p>}
    </dl>
  )
}

export default function DatasetsPage() {
  const { id } = useParams<{ id: string }>()
  const [s, setS] = useState<Session | null | undefined>(undefined)
  const [errors, setErrors] = useState<Record<number, string>>({})
  useEffect(() => { void getSession(id).then(setS) }, [id])
  if (s === undefined) return <p className="p-8 text-text-muted">Loading…</p>
  if (s === null) return <p className="p-8">Session not found. <Link className="text-accent" href="/sessions">Back to sessions</Link></p>

  const update = async (next: Session) => { setS(next); await saveSession(next) }
  const setDataset = (slot: number, fn: (d: Dataset) => Dataset) => update({ ...s, datasets: s.datasets.map((d) => (d.slot === slot ? fn(d) : d)) })

  async function onFile(slot: number, file: File) {
    const text = await file.text()
    const r = importCsv(text, s!.effectiveDate)
    if (r.missingFields.length) {
      setErrors((e) => ({ ...e, [slot]: `This file is missing: ${r.missingFields.join(', ')}. Check the export settings for your MLS.` }))
      return
    }
    setErrors((e) => ({ ...e, [slot]: '' }))
    await setDataset(slot, (d) => {
      const known = new Set(d.properties.map((p) => p.id))
      return { ...d, properties: [...d.properties, ...r.properties.filter((p) => !known.has(p.id))], excludedAfterEffective: d.excludedAfterEffective + r.excludedAfterEffective }
    })
  }

  const loaded = s.datasets.some((d) => d.properties.length > 0)
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-1 text-center text-lg font-semibold">Datasets for this session</h1>
      <p className="mb-4 text-center text-text-muted">{s.name} · {s.mls} · {s.propertyType} · effective {s.effectiveDate}</p>
      <div className="grid gap-3 rounded-md border border-border p-3 shadow-card md:grid-cols-3">
        {s.datasets.map((d) => (
          <section key={d.slot} aria-label={d.name} className="flex flex-col gap-3 rounded-md border border-border p-3">
            <input aria-label={`Name of dataset ${d.slot}`} className="border-b border-border bg-transparent font-semibold"
              value={d.name} onChange={(e) => void setDataset(d.slot, (x) => ({ ...x, name: e.target.value }))} />
            <Stats d={d} />
            <DropZone hasData={d.properties.length > 0} error={errors[d.slot]} onFile={(f) => void onFile(d.slot, f)} />
            <div className="flex gap-2">
              {d.properties.length === 0 && (
                <Button variant="secondary" onClick={() => void setDataset(d.slot, (x) => ({ ...x, properties: syntheticMarket(120, 11 + d.slot * 7, s.effectiveDate) }))}>Load sample (synthetic)</Button>
              )}
              {d.properties.length > 0 && (
                <Link className="text-accent" href={`/session/${s.id}/datasets/${d.slot}/properties`}>View or edit sales</Link>
              )}
              {d.properties.length > 0 && (
                <Button variant="link" onClick={() => { if (confirm('Remove all properties from this dataset?')) void setDataset(d.slot, (x) => ({ ...x, properties: [], excludedAfterEffective: 0 })) }}>Remove all</Button>
              )}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-text-muted">Only sold properties are used. Sample data is made up and only for trying the screens.</p>
      <div className="mt-4 flex justify-center">
        {loaded ? <Link className="rounded-md bg-accent px-6 py-3 font-semibold text-on-accent" href={`/session/${s.id}/results`}>Continue to results</Link>
          : <Button disabled>Add data to continue</Button>}
      </div>
    </div>
  )
}
