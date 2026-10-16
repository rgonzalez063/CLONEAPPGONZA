'use client'
import { useEffect, useRef, useState } from 'react'
import type { Listing } from '@/engines'
import { ACCEPTED, TARGET_LABELS, toListings, toProperties, toSubject, type ExtractTarget, type MarketRow, type SaleRow, type SubjectScan } from '@/lib/extract'
import type { StoredProperty } from '@/lib/importer'
import { logEvent, scanDocument, scanStatus, type ScanOutcome } from '@/lib/store'
import type { Subject } from '@/lib/types'
import { Button, Modal } from './ui'

export type ScanApplied =
  | { target: 'subject'; subject: Partial<Subject>; effectiveDate: string | null }
  | { target: 'sales'; properties: StoredProperty[] }
  | { target: 'market'; listings: Listing[] }

type Col<T> = { key: keyof T & string; label: string; kind: 'text' | 'number' | 'date' | 'bool'; w: string }
const SALE_COLS: Col<SaleRow>[] = [
  { key: 'mlsNumber', label: 'MLS #', kind: 'text', w: 'w-24' }, { key: 'address', label: 'Address', kind: 'text', w: 'w-44' }, { key: 'salePrice', label: 'Sale price', kind: 'number', w: 'w-24' },
  { key: 'saleDate', label: 'Sale date', kind: 'date', w: 'w-28' }, { key: 'contractDate', label: 'Contract', kind: 'date', w: 'w-28' }, { key: 'gla', label: 'GLA', kind: 'number', w: 'w-16' },
  { key: 'lotSize', label: 'Lot', kind: 'number', w: 'w-20' }, { key: 'bedrooms', label: 'Beds', kind: 'number', w: 'w-12' }, { key: 'bathsFull', label: 'Full', kind: 'number', w: 'w-12' },
  { key: 'bathsHalf', label: 'Half', kind: 'number', w: 'w-12' }, { key: 'garage', label: 'Gar.', kind: 'number', w: 'w-12' }, { key: 'yearBuilt', label: 'Year', kind: 'number', w: 'w-16' },
  { key: 'concessions', label: 'Conc.', kind: 'number', w: 'w-16' }, { key: 'financing', label: 'Terms', kind: 'text', w: 'w-24' },
]
const MARKET_COLS: Col<MarketRow>[] = [
  { key: 'mlsNumber', label: 'MLS #', kind: 'text', w: 'w-24' }, { key: 'status', label: 'Status', kind: 'text', w: 'w-24' }, { key: 'listDate', label: 'Listed', kind: 'date', w: 'w-28' },
  { key: 'listPrice', label: 'List price', kind: 'number', w: 'w-24' }, { key: 'soldPrice', label: 'Sold price', kind: 'number', w: 'w-24' }, { key: 'contractDate', label: 'Pending', kind: 'date', w: 'w-28' },
  { key: 'closeDate', label: 'Closed', kind: 'date', w: 'w-28' }, { key: 'offMarketDate', label: 'Off market', kind: 'date', w: 'w-28' }, { key: 'gla', label: 'GLA', kind: 'number', w: 'w-16' },
  { key: 'dom', label: 'DOM', kind: 'number', w: 'w-14' }, { key: 'concessions', label: 'Conc.', kind: 'number', w: 'w-16' }, { key: 'specialConditions', label: 'Notes', kind: 'text', w: 'w-24' },
]
const SUBJECT_LABELS: Record<keyof SubjectScan['fields'], string> = {
  address: 'Street address', city: 'City', state: 'State', zip: 'Zip code', gla: 'GLA (sqft)', lotSize: 'Lot size (sqft)', bedrooms: 'Bedrooms', bathsFull: 'Baths: full', bathsHalf: 'Baths: half',
  stories: 'Stories', garage: 'Garage spaces', yearBuilt: 'Year built', quality: 'UAD quality', condition: 'UAD condition', effectiveDate: 'Effective date',
}

function Grid<T extends { confidence: string; note: string }>({ cols, rows, setRows, keep, setKeep }: { cols: Col<T>[]; rows: T[]; setRows: (r: T[]) => void; keep: boolean[]; setKeep: (k: boolean[]) => void }) {
  const edit = (i: number, key: keyof T & string, kind: Col<T>['kind'], v: string) => {
    const next = rows.slice()
    next[i] = { ...next[i], [key]: v.trim() === '' ? null : kind === 'number' ? (Number.isFinite(Number(v.replace(/[$,]/g, ''))) ? Number(v.replace(/[$,]/g, '')) : v) : v }
    setRows(next)
  }
  return (
    <div className="max-h-[46vh] overflow-auto rounded-md border border-border">
      <table className="text-xs">
        <thead className="sticky top-0 bg-surface"><tr>
          <th className="px-2 py-1">Use</th>{cols.map((c) => <th key={c.key} className="px-1 py-1 text-left">{c.label}</th>)}<th className="px-2 py-1 text-left">Confidence</th><th className="px-2 py-1 text-left">Note</th>
        </tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-border ${r.confidence === 'low' ? 'bg-warning-soft' : ''}`}>
              <td className="px-2"><input type="checkbox" aria-label={`Use row ${i + 1}`} checked={keep[i]} onChange={(e) => setKeep(keep.map((k, j) => (j === i ? e.target.checked : k)))} /></td>
              {cols.map((c) => (
                <td key={c.key} className="px-1 py-0.5">
                  <input aria-label={`${c.label}, row ${i + 1}`} className={`h-7 ${c.w} rounded-sm border border-border-input px-1`} value={(r[c.key] as unknown as string | number | null) ?? ''} onChange={(e) => edit(i, c.key, c.kind, e.target.value)} />
                </td>
              ))}
              <td className="px-2">{r.confidence}</td><td className="max-w-56 px-2 text-text-muted">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Choose a file, let the AI read it, check and fix what it found, then hand it to the screen that asked. */
export function ScanModal({ target, sessionId, effectiveDate, onClose, onApply }: {
  target: ExtractTarget; sessionId: string; effectiveDate: string; onClose: () => void; onApply: (a: ScanApplied) => void | Promise<void>
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState<{ model: string; keyInEnvironment: boolean; maxMegabytes: number } | null>(null)
  const [out, setOut] = useState<ScanOutcome | null>(null)
  const [fileName, setFileName] = useState('')
  const [sales, setSales] = useState<SaleRow[]>([])
  const [market, setMarket] = useState<MarketRow[]>([])
  const [keep, setKeep] = useState<boolean[]>([])
  const [fields, setFields] = useState<Record<string, { value: string; use: boolean; evidence: string }>>({})
  useEffect(() => { scanStatus().then(setHint).catch(() => undefined) }, [])

  async function pick(file: File) {
    setBusy(true); setError(''); setFileName(file.name)
    try {
      const r = await scanDocument(target, file)
      setOut(r)
      if (target === 'sales') { const rows = (r.scan as { sales: SaleRow[] }).sales; setSales(rows); setKeep(rows.map(() => true)) }
      if (target === 'market') { const rows = (r.scan as { listings: MarketRow[] }).listings; setMarket(rows); setKeep(rows.map(() => true)) }
      if (target === 'subject') {
        const f = (r.scan as SubjectScan).fields
        setFields(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, { value: v.value === null ? '' : String(v.value), use: v.value !== null, evidence: v.evidence }])))
      }
      void logEvent(sessionId, 'ai.scanned', { file: file.name, target })
    } catch (e) { setError(e instanceof Error ? e.message : 'The scan failed.') } finally { setBusy(false) }
  }

  const subjectScan = (): SubjectScan => {
    const base = out!.scan as SubjectScan
    const next = JSON.parse(JSON.stringify(base)) as SubjectScan
    for (const k of Object.keys(next.fields) as (keyof SubjectScan['fields'])[]) {
      const f = fields[k]
      const raw = f && f.use && f.value.trim() !== '' ? f.value.trim() : null
      const isNum = ['gla', 'lotSize', 'bedrooms', 'bathsFull', 'bathsHalf', 'stories', 'garage', 'yearBuilt'].includes(k)
      ;(next.fields[k] as { value: string | number | null }).value = raw === null ? null : isNum ? Number(raw.replace(/[$,]/g, '')) : raw
    }
    return next
  }
  const chosenSales = sales.filter((_, i) => keep[i])
  const chosenMarket = market.filter((_, i) => keep[i])
  const convertedSales = target === 'sales' && out ? toProperties(chosenSales, effectiveDate) : null
  const convertedMarket = target === 'market' && out ? toListings(chosenMarket) : null
  const convertedSubject = target === 'subject' && out ? toSubject(subjectScan()) : null
  const count = convertedSales?.properties.length ?? convertedMarket?.listings.length ?? convertedSubject?.filled.length ?? 0
  const problems = convertedSales?.problems ?? convertedMarket?.problems ?? []

  async function apply() {
    if (convertedSales) await onApply({ target: 'sales', properties: convertedSales.properties })
    else if (convertedMarket) await onApply({ target: 'market', listings: convertedMarket.listings })
    else if (convertedSubject) await onApply({ target: 'subject', subject: convertedSubject.subject, effectiveDate: convertedSubject.effectiveDate })
    onClose()
  }

  return (
    <Modal wide title={`Scan a document: ${TARGET_LABELS[target]}`} onClose={onClose}
      footer={<>
        <Button variant="danger" onClick={onClose}>Cancel</Button>
        {out && <Button disabled={count === 0} onClick={() => void apply()}>{target === 'subject' ? `Use ${count} value${count === 1 ? '' : 's'}` : `Add ${count} ${target === 'sales' ? 'sale' : 'listing'}${count === 1 ? '' : 's'}`}</Button>}
      </>}>
      {!out && (
        <div className="flex flex-col gap-3 text-sm">
          <p>Choose a file and an AI model will read it and pull out the data. You check and fix what it found before anything is saved.</p>
          <p className="text-text-muted">Accepts {ACCEPTED}. Up to {hint?.maxMegabytes ?? 15} MB.</p>
          <p className="rounded-md border border-border bg-surface p-2 text-xs text-text-muted">
            The file is sent to Anthropic&apos;s AI service to be read{hint ? ` (model: ${hint.model})` : ''}. This app does not keep a copy. Do not scan files you are not allowed to send.
          </p>
          {hint && !hint.keyInEnvironment && (
            <p role="note" className="rounded-md border border-warning p-2 text-xs">
              No Anthropic API key was found. Add a line <code>ANTHROPIC_API_KEY=your-key</code> to the <code>.env.local</code> file and restart the app. If you signed in with the Anthropic command line, the scan may still work.
            </p>
          )}
          <Button loading={busy} onClick={() => input.current?.click()}>{busy ? 'Reading the file…' : 'Choose a file'}</Button>
          <input ref={input} type="file" className="sr-only" aria-label="Choose a file to scan" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); e.target.value = '' }} />
          {busy && <p role="status" className="text-text-muted">This can take up to a minute for a long document.</p>}
          {error && <p role="alert" className="text-danger">{error}</p>}
        </div>
      )}

      {out && (
        <div className="flex flex-col gap-3 text-sm">
          <p><b>{fileName}</b>: read as <i>{out.scan.documentType || 'a document'}</i>. Check every value against the document; the AI can misread a figure.</p>
          {out.scan.notes && <p role="note" className="rounded-md border border-border bg-surface p-2 text-xs">{out.scan.notes}</p>}
          {target === 'subject' && (
            <table className="text-sm"><thead><tr className="text-left text-xs text-text-muted"><th className="px-2">Use</th><th className="px-2">Field</th><th className="px-2">Value</th><th className="px-2">Where it came from</th></tr></thead>
              <tbody>{(Object.keys(SUBJECT_LABELS) as (keyof SubjectScan['fields'])[]).map((k) => (
                <tr key={k} className="border-t border-border">
                  <td className="px-2"><input type="checkbox" aria-label={`Use ${SUBJECT_LABELS[k]}`} checked={fields[k]?.use ?? false} onChange={(e) => setFields({ ...fields, [k]: { ...fields[k], use: e.target.checked } })} /></td>
                  <td className="px-2">{SUBJECT_LABELS[k]}</td>
                  <td className="px-2"><input aria-label={SUBJECT_LABELS[k]} className="h-8 w-56 rounded-sm border border-border-input px-2" value={fields[k]?.value ?? ''} onChange={(e) => setFields({ ...fields, [k]: { ...fields[k], value: e.target.value, use: e.target.value !== '' } })} /></td>
                  <td className="px-2 text-xs text-text-muted">{fields[k]?.evidence}</td>
                </tr>))}</tbody></table>
          )}
          {target === 'sales' && <Grid cols={SALE_COLS} rows={sales} setRows={setSales} keep={keep} setKeep={setKeep} />}
          {target === 'market' && <Grid cols={MARKET_COLS} rows={market} setRows={setMarket} keep={keep} setKeep={setKeep} />}
          {problems.length > 0 && (
            <details className="text-xs"><summary className="cursor-pointer">{problems.length} row{problems.length === 1 ? '' : 's'} set aside</summary>
              <ul className="mt-1 list-disc pl-5">{problems.map((p) => <li key={p.index}>Row {p.index + 1} of those you kept: {p.reason}</li>)}</ul></details>
          )}
          <p className="text-xs text-text-muted">{out.usage.inputTokens.toLocaleString('en-US')} tokens read, {out.usage.outputTokens.toLocaleString('en-US')} written.</p>
          <Button variant="link" onClick={() => { setOut(null); setError('') }}>Scan a different file</Button>
        </div>
      )}
    </Modal>
  )
}
