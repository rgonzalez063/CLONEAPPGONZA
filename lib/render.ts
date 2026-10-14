import type { Block } from './documents'

// ------------------------------------------------------------------ RTF
const esc = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\line ')
    .replace(/[^\x00-\x7f]/g, (c) => `\\u${c.charCodeAt(0)}?`)

export function toRtf(blocks: Block[], landscape = false): string {
  const out: string[] = ['{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}', landscape ? '\\paperw15840\\paperh12240\\landscape' : '\\paperw12240\\paperh15840', '\\margl720\\margr720\\margt720\\margb720\\fs20']
  const width = landscape ? 14400 : 10800
  for (const b of blocks) {
    if (b.kind === 'title') out.push(`\\pard\\qc\\b\\fs30 ${esc(b.text)}\\b0\\fs20\\par\\par`)
    else if (b.kind === 'h') out.push(`\\pard\\ql\\sb200\\b\\fs24 ${esc(b.text)}\\b0\\fs20\\par`)
    else if (b.kind === 'p') out.push(`\\pard\\ql ${esc(b.text)}\\par\\par`)
    else {
      const n = Math.max(1, b.head.length)
      const cell = Math.floor(width / n)
      const row = (cells: string[], bold: boolean) => {
        const defs = Array.from({ length: n }, (_, i) => `\\clbrdrt\\brdrs\\clbrdrl\\brdrs\\clbrdrb\\brdrs\\clbrdrr\\brdrs\\cellx${cell * (i + 1)}`).join('')
        const body = Array.from({ length: n }, (_, i) => `\\pard\\intbl ${bold ? '\\b ' : ''}${esc(cells[i] ?? '')}${bold ? '\\b0' : ''}\\cell`).join('')
        return `\\trowd\\trgaph80${defs}${body}\\row`
      }
      out.push(row(b.head, true), ...b.rows.map((r) => row(r, false)), '\\pard\\par')
    }
  }
  out.push('}')
  return out.join('\n')
}

// ------------------------------------------------------------------ PDF
export async function toPdf(blocks: Block[], landscape = false): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' })
  const margin = 48
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const textW = pageW - margin * 2
  let y = margin
  const need = (h: number) => { if (y + h > pageH - margin) { doc.addPage(); y = margin } }
  for (const b of blocks) {
    if (b.kind === 'title') {
      doc.setFont('helvetica', 'bold').setFontSize(16)
      need(30); doc.text(b.text, pageW / 2, y, { align: 'center' }); y += 30
    } else if (b.kind === 'h') {
      doc.setFont('helvetica', 'bold').setFontSize(12)
      need(26); doc.text(b.text, margin, y); y += 18
    } else if (b.kind === 'p') {
      doc.setFont('helvetica', 'normal').setFontSize(10)
      const lines = doc.splitTextToSize(b.text, textW) as string[]
      for (const line of lines) { need(14); doc.text(line, margin, y); y += 13 }
      y += 8
    } else {
      autoTable(doc, {
        startY: y, head: [b.head], body: b.rows, margin: { left: margin, right: margin },
        styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [47, 91, 234] }, theme: 'grid',
      })
      y = ((doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? y) + 14
    }
  }
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p).setFont('helvetica', 'normal').setFontSize(8)
    doc.text(`Page ${p} of ${pages}`, pageW - margin, pageH - 24, { align: 'right' })
  }
  return new Uint8Array(doc.output('arraybuffer'))
}

// ------------------------------------------------------------------ files
export function download(name: string, data: Uint8Array | string, type: string) {
  const blob = new Blob([data as BlobPart], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
