'use client'
import { useState } from 'react'
import { ApiError, createTemplate, templateContents, updateTemplate, type Session, type Template } from '@/lib/store'
import { Button, Modal, TextInput } from './ui'

/** Saves this session's settings, features and layout as a new template, or replaces an existing one's contents. */
export function SaveTemplateModal({ session, current, onClose, onSaved }: { session: Session; current: Template | null; onClose: () => void; onSaved: (t: Template, replaced: boolean) => void }) {
  const [mode, setMode] = useState<'new' | 'replace'>(current ? 'replace' : 'new')
  const [name, setName] = useState('')
  const [isDefault, setDefault] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const contents = templateContents(session)

  async function save() {
    setBusy(true); setError('')
    try {
      if (mode === 'replace' && current) onSaved(await updateTemplate(current.id, contents), true)
      else {
        if (!name.trim()) { setError('Give the template a name.'); return }
        onSaved(await createTemplate({ name: name.trim(), state: session.state, mls: session.mls, propertyType: session.propertyType, ...contents, isDefault }), false)
      }
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong.') } finally { setBusy(false) }
  }
  return (
    <Modal title="Save as a template" onClose={onClose}
      footer={<><Button variant="danger" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => void save()}>{mode === 'replace' ? 'Replace template' : 'Save template'}</Button></>}>
      <p className="mb-3 text-sm text-text-muted">
        A template keeps your settings (transactional adjustments, paired sales rules, comment options), the features you analyze and their order, and your dataset names.
        It never keeps sales data, results or the subject.
      </p>
      {current && (
        <fieldset className="mb-3 flex flex-col gap-1 text-sm">
          <label className="flex items-center gap-2"><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> Update &ldquo;{current.name}&rdquo; with what is on screen</label>
          <label className="flex items-center gap-2"><input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} /> Save as a new template</label>
        </fieldset>
      )}
      {mode === 'new' && (
        <div className="flex flex-col gap-3">
          <TextInput label="Template name" placeholder="for example: Luxury homes" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isDefault} onChange={(e) => setDefault(e.target.checked)} /> Use it by default for {session.mls} {session.propertyType}</label>
        </div>
      )}
      <ul className="mt-3 list-disc pl-5 text-sm text-text-muted">
        <li>{contents.features.length} feature{contents.features.length === 1 ? '' : 's'}, in the current order</li>
        <li>Transactional adjustments: {contents.settings.transactional ? 'your choices' : 'the defaults'}</li>
        <li>Paired sales rules: {contents.settings.pairedSettings ? 'your choices' : 'the defaults'}</li>
      </ul>
      {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    </Modal>
  )
}
