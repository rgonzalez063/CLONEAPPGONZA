import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { ExtractError, buildContent, runExtraction, validateScan, type ClientLike } from './extract'
import { FileProblem, docxText, prepareFile, rtfText, xlsxText } from './fileText'

const fake = (message: object): ClientLike => ({ messages: { stream: () => ({ finalMessage: async () => message as never }) } })
const ok = (obj: unknown) => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }], usage: { input_tokens: 1200, output_tokens: 340 } })
const salesJson = { documentType: 'MLS sales report', notes: '', sales: [{
  mlsNumber: '1', address: null, status: 'Closed', salePrice: 250000, saleDate: '2026-07-01', contractDate: null, listPrice: null, gla: 1500, lotSize: null, bedrooms: null, bathsFull: 2, bathsHalf: null,
  garage: null, stories: null, yearBuilt: null, pool: null, concessions: null, financing: null, confidence: 'high', note: '',
}] }

describe('reading files', () => {
  it('passes PDFs and images through and checks they are what they say', () => {
    expect(prepareFile('a.pdf', 'application/pdf', Buffer.from('%PDF-1.4 test')).kind).toBe('pdf')
    expect(() => prepareFile('a.pdf', 'application/pdf', Buffer.from('not a pdf'))).toThrow(FileProblem)
    expect(prepareFile('shot.PNG', '', Buffer.from([1, 2, 3]))).toMatchObject({ kind: 'image', mediaType: 'image/png' })
    expect(() => prepareFile('p.heic', '', Buffer.from([1]))).toThrow(/HEIC/)
  })
  it('reads text-like files', () => {
    expect(prepareFile('x.csv', 'text/csv', Buffer.from('a,b\n1,2'))).toEqual({ kind: 'text', text: 'a,b\n1,2' })
    expect(prepareFile('x.html', '', Buffer.from('<table><tr><td>MLS</td><td>1</td></tr></table>'))).toMatchObject({ kind: 'text' })
    expect(rtfText('{\\rtf1\\ansi Hello\\par World\\tab 5}')).toBe('Hello\nWorld\t5')
  })
  it('reads Word documents, tables included', () => {
    const doc = '<w:document><w:body><w:p><w:r><w:t>Subject</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>GLA</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>1,447</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'
    const zip = zipSync({ 'word/document.xml': strToU8(doc) })
    expect(docxText(zip)).toBe('Subject\nGLA\t1,447')
  })
  it('reads Excel workbooks with shared strings and numbers', () => {
    const sst = '<sst><si><t>MLS</t></si><si><t>Price</t></si></sst>'
    const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>1001</v></c><c r="C2"><v>250000</v></c></row></sheetData></worksheet>'
    const zip = zipSync({ 'xl/sharedStrings.xml': strToU8(sst), 'xl/worksheets/sheet1.xml': strToU8(sheet) })
    expect(xlsxText(zip)).toBe('--- sheet 1 ---\nMLS\tPrice\n1001\t\t250000')
  })
  it('refuses what it cannot read, in plain words', () => {
    expect(() => prepareFile('a.zip', '', Buffer.from([1]))).toThrow(/cannot read \.zip/)
    expect(() => prepareFile('a.txt', '', Buffer.from('   '))).toThrow(/No text was found/)
    expect(() => prepareFile('a.txt', '', Buffer.alloc(0))).toThrow(/empty/)
    expect(() => prepareFile('a.docx', '', Buffer.from('nope'))).toThrow(FileProblem)
  })
})

describe('asking the model', () => {
  it('sends a PDF as a document block and a text file inside the instruction', () => {
    const pdf = buildContent('sales', 'r.pdf', { kind: 'pdf', mediaType: 'application/pdf', base64: 'QUJD' }) as { type: string }[]
    expect(pdf.map((b) => b.type)).toEqual(['document', 'text'])
    const txt = buildContent('market', 'm.csv', { kind: 'text', text: 'a,b' }) as { type: string; text: string }[]
    expect(txt).toHaveLength(1)
    expect(txt[0].text).toContain('<document>\na,b\n</document>')
  })
  it('returns the scan and the tokens used', async () => {
    const r = await runExtraction(fake(ok(salesJson)), 'sales', 'r.pdf', { kind: 'pdf', mediaType: 'application/pdf', base64: 'QUJD' }, 'test-model')
    expect(r.usage).toEqual({ inputTokens: 1200, outputTokens: 340 })
    expect((r.scan as { sales: unknown[] }).sales).toHaveLength(1)
    expect(r.model).toBe('test-model')
  })
  it('asks for a strict JSON shape and sends the model, effort and file', async () => {
    let seen: Record<string, unknown> = {}
    const client: ClientLike = { messages: { stream: (body) => { seen = body as Record<string, unknown>; return { finalMessage: async () => ok(salesJson) as never } } } }
    await runExtraction(client, 'sales', 'r.csv', { kind: 'text', text: 'x' }, 'm1')
    expect(seen.model).toBe('m1')
    expect((seen.output_config as { format: { type: string }; effort: string }).format.type).toBe('json_schema')
    expect((seen.output_config as { effort: string }).effort).toBe('medium')
    expect(String(seen.system)).toContain('ignore')
  })
  it('turns refusals, cut-off output and bad JSON into plain errors', async () => {
    const file = { kind: 'text', text: 'x' } as const
    await expect(runExtraction(fake({ stop_reason: 'refusal', content: [], usage: { input_tokens: 1, output_tokens: 1 } }), 'sales', 'a', file)).rejects.toMatchObject({ status: 422 })
    await expect(runExtraction(fake({ stop_reason: 'max_tokens', content: [], usage: { input_tokens: 1, output_tokens: 1 } }), 'sales', 'a', file)).rejects.toThrow(/too many rows/)
    await expect(runExtraction(fake({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'sorry' }], usage: { input_tokens: 1, output_tokens: 1 } }), 'sales', 'a', file)).rejects.toBeInstanceOf(ExtractError)
  })
  it('explains a missing key without leaking anything', async () => {
    const client: ClientLike = { messages: { stream: () => ({ finalMessage: async () => { throw new Error('Could not resolve authentication method. Expected either apiKey or authToken to be set.') } }) } }
    await expect(runExtraction(client, 'sales', 'a', { kind: 'text', text: 'x' })).rejects.toMatchObject({ status: 503, message: expect.stringContaining('ANTHROPIC_API_KEY') })
  })
  it('rejects a reply that is not the shape asked for', () => {
    expect(() => validateScan('sales', { documentType: 'x', notes: '', sales: [{ mlsNumber: 5 }] })).toThrow(ExtractError)
    expect(validateScan('sales', { ...salesJson, sales: [{ ...salesJson.sales[0], confidence: 'sure' }] })).toMatchObject({ sales: [{ confidence: 'low' }] })
  })
})
