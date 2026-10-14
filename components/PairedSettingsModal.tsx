'use client'
import { useMemo, useState } from 'react'
import type { MatchRule } from '@/engines'
import type { PreparedDataset } from '@/lib/analysis'
import { CANDIDATES, defaultPairedSettings, pairCounts, validateRule, type PairedSettings } from '@/lib/pairedSettings'
import { Button, Modal } from './ui'

type Kind = MatchRule['type']
const KINDS: { value: Kind; label: string }[] = [
  { value: 'exact', label: 'Exactly the same' },
  { value: 'pct', label: 'Within a percentage' },
  { value: 'abs', label: 'Within a number of units' },
  { value: 'identicalOrBothGreater', label: 'The same, or both more than' },
]

function ruleOf(kind: Kind, prev: MatchRule): MatchRule {
  if (kind === 'exact') return { type: 'exact' }
  if (kind === 'pct') return { type: 'pct', pct: prev.type === 'pct' ? prev.pct : 5 }
  if (kind === 'abs') return { type: 'abs', tol: prev.type === 'abs' ? prev.tol : 100 }
  return { type: 'identicalOrBothGreater', n: prev.type === 'identicalOrBothGreater' ? prev.n : 3 }
}
const amount = (r: MatchRule) => (r.type === 'pct' ? r.pct : r.type === 'abs' ? r.tol : r.type === 'identicalOrBothGreater' ? r.n : null)
const withAmount = (r: MatchRule, v: number): MatchRule =>
  r.type === 'pct' ? { type: 'pct', pct: v } : r.type === 'abs' ? { type: 'abs', tol: v } : r.type === 'identicalOrBothGreater' ? { type: 'identicalOrBothGreater', n: v } : r

export function PairedSettingsModal({ value, onSave, onClose, prepared, featureKeys, featureLabels }: {
  value: PairedSettings | undefined
  onSave: (s: PairedSettings) => void
  onClose: () => void
  prepared: PreparedDataset[]
  featureKeys: string[]
  featureLabels: Record<string, string>
}) {
  const [s, setS] = useState<PairedSettings>(value ?? defaultPairedSettings())
  const errors = Object.fromEntries(CANDIDATES.map((c) => [c.key, s.features[c.key] ? validateRule(s.features[c.key].rule) : null]))
  const invalid = Object.values(errors).some(Boolean)
  const counts = useMemo(
    () => (invalid ? [] : pairCounts(prepared.map((d) => ({ name: d.name, props: d.props })), featureKeys, s)),
    [prepared, featureKeys, s, invalid],
  )
  const setFeature = (key: string, patch: Partial<PairedSettings['features'][string]>) =>
    setS({ ...s, features: { ...s.features, [key]: { ...s.features[key], ...patch } } })

  return (
    <Modal title="Paired sales settings" onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={() => setS(defaultPairedSettings())}>Reset to defaults</Button>
        <Button variant="danger" onClick={onClose}>Cancel</Button>
        <Button disabled={invalid} onClick={() => onSave(s)}>Save</Button>
      </>}>
      <p className="mb-3 text-sm text-text-muted">
        Two sales form a pair when they match on every feature switched on below, and differ on the feature being studied.
        Looser rules find more pairs; stricter rules find fewer but cleaner ones.
      </p>
      <ul className="flex flex-col gap-2" aria-label="Features to match on">
        {CANDIDATES.map((c) => {
          const f = s.features[c.key] ?? { enabled: c.enabled, rule: c.rule }
          const amt = amount(f.rule)
          const sizeUnit = c.key === 'gla' || c.key === 'lot_size' ? 'sqft' : c.key === 'age' ? 'years' : 'units'
          return (
            <li key={c.key} className="grid items-center gap-2 rounded-md border border-border p-2 sm:grid-cols-[160px_1fr]">
              <label className="flex items-center gap-2 font-semibold">
                <input type="checkbox" checked={f.enabled} onChange={(e) => setFeature(c.key, { enabled: e.target.checked })} /> {c.label}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <select aria-label={`${c.label}: how close`} className="h-9 rounded-md border border-border-input px-2" value={f.rule.type} disabled={!f.enabled}
                  onChange={(e) => setFeature(c.key, { rule: ruleOf(e.target.value as Kind, f.rule) })}>
                  {KINDS.filter((k) => c.unit === 'number' || k.value === 'exact').map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
                {amt !== null && (
                  <label className="flex items-center gap-1 text-xs text-text-muted">
                    <input type="number" aria-label={`${c.label}: amount`} aria-invalid={!!errors[c.key]} className="h-9 w-20 rounded-md border border-border-input px-2 text-sm text-text" value={amt} min={0} disabled={!f.enabled}
                      onChange={(e) => setFeature(c.key, { rule: withAmount(f.rule, e.target.value === '' ? NaN : Number(e.target.value)) })} />
                    {f.rule.type === 'pct' ? '%' : f.rule.type === 'abs' ? sizeUnit : ''}
                  </label>
                )}
                {errors[c.key] && <span role="alert" className="text-xs text-danger">{errors[c.key]}</span>}
              </div>
            </li>
          )
        })}
      </ul>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={s.removeOutliers} onChange={(e) => setS({ ...s, removeOutliers: e.target.checked })} />
        Set aside pair rates far from the rest (beyond 1.5 times the interquartile range)
      </label>
      <h3 className="mb-1 mt-4 font-semibold">Pairs found with these settings</h3>
      {counts.length === 0 ? <p className="text-sm text-text-muted">{invalid ? 'Fix the highlighted values to see the pair counts.' : 'No data loaded yet.'}</p> : (
        <table className="w-full text-sm" aria-label="Pairs found">
          <thead><tr className="text-left text-text-muted"><th>Feature</th>{prepared.map((d) => <th key={d.slot} className="text-right">{d.name}</th>)}</tr></thead>
          <tbody>{counts.map((r) => <tr key={r.key} className="border-t border-border"><td>{featureLabels[r.key] ?? r.label}</td>{r.counts.map((n, i) => <td key={i} className="text-right">{n.toLocaleString('en-US')}</td>)}</tr>)}</tbody>
        </table>
      )}
    </Modal>
  )
}
