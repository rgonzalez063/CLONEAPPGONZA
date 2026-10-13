'use client'
import { useRef, useState } from 'react'

export function DropZone({ hasData, onFile, error }: { hasData: boolean; onFile: (file: File) => void; error?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
        className={`flex h-48 w-full flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed text-sm ${over ? 'bg-accent-soft' : 'bg-bg'} ${hasData ? 'border-success text-success' : 'border-accent text-accent'}`}
      >
        <span aria-hidden className="text-3xl">⬆</span>
        {hasData ? 'Click or drop a file to add more sales' : 'Click or drop an MLS export (.csv) here'}
      </button>
      <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose a CSV file"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  )
}
