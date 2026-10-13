'use client'
import { useState } from 'react'
import { DropZone } from '@/components/DropZone'
import { FeatureWidget } from '@/components/FeatureWidget'
import { Button, Select, TextInput, Toggle } from '@/components/ui'
import { FEATURES } from '@/lib/features'
import { defaultWidget } from '@/lib/analysis'
import type { WidgetState } from '@/lib/store'

const demo = [
  { slot: 1, name: 'Competing', count: 60, results: [
    { method: 'TPS' as const, variant: 'avg', value: 41, mae: 30, status: 'ok' as const },
    { method: 'TPS' as const, variant: 'median', value: 38, mae: 28, status: 'ok' as const },
    { method: 'OLS' as const, variant: '', value: 45, mae: 6000, status: 'ok' as const },
    { method: 'TS' as const, variant: '', value: 43, mae: 6100, status: 'ok' as const },
    { method: 'SENS' as const, variant: '', value: 39, mae: 5000, status: 'ok' as const }] },
  { slot: 2, name: 'Broader', count: 200, results: [
    { method: 'OLS' as const, variant: '', value: 52, mae: 20000, status: 'ok' as const },
    { method: 'GD' as const, variant: 'avg', value: null, mae: null, status: 'no_result' as const, reason: 'not enough properties (minimum 2 per group)' }] },
]

export default function DesignPage() {
  const [on, setOn] = useState(true)
  const [w, setW] = useState<WidgetState>({ ...defaultWidget(), chosen: 42 })
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6">
      <h1 className="text-xl font-bold">Design check</h1>
      <section className="flex flex-wrap gap-2" aria-label="Buttons">
        <Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="danger">Danger</Button>
        <Button variant="link">Link</Button><Button disabled>Disabled</Button><Button loading>Loading</Button>
      </section>
      <section className="grid gap-3 sm:grid-cols-2" aria-label="Fields">
        <Select label="Select" options={['One', 'Two']} />
        <TextInput label="Input" placeholder="placeholder" />
        <TextInput label="Input with error" error="This is wrong." defaultValue="oops" />
        <TextInput label="Input with hint" hint="A hint under the field." />
        <Toggle label="Toggle" checked={on} onChange={setOn} />
      </section>
      <section className="grid gap-3 sm:grid-cols-2" aria-label="Dropzones">
        <DropZone hasData={false} onFile={() => {}} /><DropZone hasData onFile={() => {}} error="This file is missing: gla." />
      </section>
      <section className="rounded-md bg-workspace p-3" aria-label="Widget">
        <FeatureWidget feature={FEATURES.gla} data={demo} state={w} subjectValue={1500} onChange={(p) => setW({ ...w, ...p })} onRemove={() => {}} />
      </section>
    </div>
  )
}
