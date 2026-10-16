// Turns an uploaded file into something the model can read: a PDF or image goes through as is, everything else as text.
import { strFromU8, unzipSync } from 'fflate'

export type Prepared =
  | { kind: 'pdf'; mediaType: 'application/pdf'; base64: string }
  | { kind: 'image'; mediaType: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'; base64: string }
  | { kind: 'text'; text: string }

export class FileProblem extends Error {}
export const MAX_TEXT_CHARS = 500_000
export const MAX_FILE_BYTES = 15 * 1024 * 1024

const ext = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] ?? '').toLowerCase()
const decode = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&')

/** Plain text of a Word document: paragraphs on their own lines, table cells separated by tabs. */
export function docxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' })
  const xml = files['word/document.xml']
  if (!xml) throw new FileProblem('That does not look like a Word document.')
  return decode(strFromU8(xml)
    .replace(/<w:tab\/>/g, '\t').replace(/<\/w:p><\/w:tc>/g, '\t').replace(/<\/w:tc>/g, '\t').replace(/<\/w:tr>/g, '\n').replace(/<\/w:p>/g, '\n').replace(/<w:br\/>/g, '\n')
    .replace(/<[^>]+>/g, '')).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Each sheet of an Excel workbook as tab-separated rows. */
export function xlsxText(bytes: Uint8Array): string {
  const files = unzipSync(bytes, { filter: (f) => /^xl\/(sharedStrings|workbook)\.xml$|^xl\/worksheets\/sheet\d+\.xml$/.test(f.name) })
  const shared = files['xl/sharedStrings.xml']
    ? [...strFromU8(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join('')))
    : []
  const sheets = Object.keys(files).filter((n) => n.startsWith('xl/worksheets/')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (!sheets.length) throw new FileProblem('That does not look like an Excel workbook.')
  const col = (ref: string) => [...(/^[A-Z]+/.exec(ref)?.[0] ?? 'A')].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1
  return sheets.map((name, i) => {
    const rows: string[] = []
    for (const row of strFromU8(files[name]).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = []
      for (const c of row[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1]
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1] ?? ''
        const type = /t="(\w+)"/.exec(attrs)?.[1]
        const raw = /<v>([\s\S]*?)<\/v>/.exec(c[2] ?? '')?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2] ?? '')?.[1] ?? ''
        cells[col(ref)] = type === 's' ? shared[Number(raw)] ?? '' : decode(raw)
      }
      rows.push([...cells].map((x) => x ?? '').join('\t'))
    }
    return `--- sheet ${i + 1} ---\n${rows.join('\n')}`
  }).join('\n\n')
}

/** Plain text of an RTF file (control words removed). */
export function rtfText(s: string): string {
  return s.replace(/\\par[d]? ?/g, '\n').replace(/\\tab ?/g, '\t').replace(/\\'([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\{\\\*[^{}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, '').replace(/\n{3,}/g, '\n\n').trim()
}

const htmlText = (s: string) => decode(s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<\/t[dh]>/gi, '\t').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim()

export function prepareFile(name: string, mediaType: string, bytes: Buffer): Prepared {
  if (bytes.length === 0) throw new FileProblem('That file is empty.')
  if (bytes.length > MAX_FILE_BYTES) throw new FileProblem(`That file is ${(bytes.length / 1048576).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1048576} MB; split it or scan fewer pages.`)
  const e = ext(name)
  const kind = mediaType.toLowerCase()
  if (kind === 'application/pdf' || e === 'pdf') {
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new FileProblem('That file is not a valid PDF.')
    return { kind: 'pdf', mediaType: 'application/pdf', base64: bytes.toString('base64') }
  }
  const image: Record<string, Extract<Prepared, { kind: 'image' }>['mediaType']> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }
  if (image[e] || ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(kind)) {
    return { kind: 'image', mediaType: image[e] ?? (kind as Extract<Prepared, { kind: 'image' }>['mediaType']), base64: bytes.toString('base64') }
  }
  if (e === 'heic' || e === 'heif' || kind.includes('heic')) throw new FileProblem('HEIC photos are not supported. Export the photo as JPG or PNG and try again.')
  let out: string
  try {
    if (e === 'docx') out = docxText(new Uint8Array(bytes))
    else if (e === 'xlsx') out = xlsxText(new Uint8Array(bytes))
    else if (e === 'rtf') out = rtfText(bytes.toString('utf8'))
    else if (['html', 'htm'].includes(e)) out = htmlText(bytes.toString('utf8'))
    else if (['csv', 'tsv', 'txt', 'text', 'md', 'json', 'xml', 'log'].includes(e) || kind.startsWith('text/')) out = bytes.toString('utf8').replace(/^﻿/, '')
    else throw new FileProblem(`This app cannot read .${e || 'unknown'} files. Use PDF, an image, Word, Excel, CSV, text, RTF or HTML.`)
  } catch (err) {
    if (err instanceof FileProblem) throw err
    throw new FileProblem('That file could not be opened. It may be damaged or password protected.')
  }
  if (!out.trim()) throw new FileProblem('No text was found in that file. If it is a scan, upload it as a PDF or image instead.')
  if (out.length > MAX_TEXT_CHARS) throw new FileProblem(`That file has ${out.length.toLocaleString('en-US')} characters, more than can be read in one go (${MAX_TEXT_CHARS.toLocaleString('en-US')}). Split it and scan the parts.`)
  return { kind: 'text', text: out }
}
