import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLogin, hashPassword, hashToken, limited, resetLimits, userForToken, verifyPassword, passwordProblem, normalizeEmail } from './auth'
import { openMemoryDb, type Db } from './db'
import * as repo from './repo'
import type { StoredProperty } from '../importer'

let db: Db
let alice = ''
let bob = ''
beforeAll(async () => {
  db = await openMemoryDb()
  const mk = async (email: string) => (await db.query<{ id: string }>('insert into users (email, password_hash) values ($1, $2) returning id', [email, await hashPassword('correct horse battery')])).rows[0].id
  alice = await mk('alice@example.com')
  bob = await mk('bob@example.com')
}, 60000)
afterAll(async () => { await db.close() })

const input = { name: 'Test session', state: 'TX', mls: 'HARMLS', propertyType: 'SFR', template: 'Standard', effectiveDate: '2026-10-09' }
const prop = (i: number, over: Partial<StoredProperty> = {}): StoredProperty => ({
  id: `M${i}`, salePrice: 200000 + i, saleDate: '2026-05-01', contractDate: '2026-04-01', status: 'closed', values: { gla: 1500 + i, lot_size: 6000 }, ...over,
})

describe('passwords and tokens', () => {
  it('hashes with a random salt and verifies', async () => {
    const a = await hashPassword('correct horse battery')
    const b = await hashPassword('correct horse battery')
    expect(a).not.toBe(b)
    expect(a.startsWith('scrypt$')).toBe(true)
    expect(await verifyPassword('correct horse battery', a)).toBe(true)
    expect(await verifyPassword('wrong password here', a)).toBe(false)
    expect(await verifyPassword('x', 'garbage')).toBe(false)
  })
  it('enforces a minimum length and normalizes emails', () => {
    expect(passwordProblem('short')).toMatch(/at least 10/)
    expect(passwordProblem('long enough password')).toBeNull()
    expect(normalizeEmail('  Ann@Example.COM ')).toBe('ann@example.com')
  })
  it('stores only a hash of the login token, and expires it', async () => {
    const { token } = await createLogin(db, alice, 'test-agent')
    const stored = await db.query<{ token_hash: string }>('select token_hash from auth_sessions where user_id = $1', [alice])
    expect(stored.rows.some((r) => r.token_hash === hashToken(token))).toBe(true)
    expect(stored.rows.some((r) => r.token_hash === token)).toBe(false)
    expect((await userForToken(db, token))?.email).toBe('alice@example.com')
    expect(await userForToken(db, 'nope')).toBeNull()
    expect(await userForToken(db, undefined)).toBeNull()
    await db.query('update auth_sessions set expires_at = now() - interval \'1 day\' where token_hash = $1', [hashToken(token)])
    expect(await userForToken(db, token)).toBeNull()
  })
  it('rate limits repeated attempts inside the window only', () => {
    resetLimits()
    const t0 = 1_000_000
    for (let i = 0; i < 5; i++) expect(limited('k', 5, 60000, t0 + i)).toBe(false)
    expect(limited('k', 5, 60000, t0 + 10)).toBe(true)
    expect(limited('other', 5, 60000, t0 + 10)).toBe(false)
    expect(limited('k', 5, 60000, t0 + 61000)).toBe(false)
  })
})

describe('sessions and data', () => {
  it('creates a session with three empty datasets and reads it back', async () => {
    const s = await repo.createSession(db, alice, input)
    expect(s.datasets.map((d) => d.name)).toEqual(['Dataset 1', 'Dataset 2', 'Dataset 3'])
    expect(s.effectiveDate).toBe('2026-10-09')
    const again = await repo.getSession(db, alice, s.id)
    expect(again?.name).toBe('Test session')
  })
  it('saves a subject, widgets and settings with a patch, leaving other fields alone', async () => {
    const s = await repo.createSession(db, alice, input)
    await repo.patchSession(db, alice, s.id, { subject: { address: '1 Main', zip: '77033', gla: 1400, lot_size: null, baths_full: 2, baths_half: null, stories: 1, garage: 0 }, dataVersion: 3 })
    await repo.patchSession(db, alice, s.id, { widgets: { gla: { chosen: 25, done: true, locked: true, model: false, low: null, high: 100 } }, transactional: { removeLeasehold: false, removeNonCash: true, removeREO: true, removeShortSale: true, deductConcessions: true, timeBasis: 'sale', timeModel: 'linear' } })
    const got = (await repo.getSession(db, alice, s.id))!
    expect(got.subject?.address).toBe('1 Main')
    expect(got.dataVersion).toBe(3)
    expect(got.widgets.gla.chosen).toBe(25)
    expect(got.transactional?.timeModel).toBe('linear')
    await repo.patchSession(db, alice, s.id, { name: 'Renamed' })
    const after = (await repo.getSession(db, alice, s.id))!
    expect(after.name).toBe('Renamed')
    expect(after.subject?.address).toBe('1 Main')
    expect(after.transactional?.timeModel).toBe('linear')
  })
  it('stores thousands of sales and returns them unchanged, including edits and deletions', async () => {
    const s = await repo.createSession(db, alice, input)
    const rows = Array.from({ length: 5000 }, (_, i) => prop(i))
    rows[1] = prop(1, { deleted: true, edits: { gla: { from: 1501, to: 1700 } }, meta: { concessions: 500, financing: 'Cash Sale', special: '', ownership: '' }, text: { cool: 'Central Electric' } })
    expect(await repo.patchDataset(db, alice, s.id, 2, { upsert: rows, excludedAfterEffective: 4 })).toBe(true)
    const got = (await repo.getSession(db, alice, s.id))!
    const d2 = got.datasets.find((d) => d.slot === 2)!
    expect(d2.properties).toHaveLength(5000)
    expect(d2.excludedAfterEffective).toBe(4)
    const one = d2.properties.find((p) => p.id === 'M1')!
    expect(one.deleted).toBe(true)
    expect(one.edits).toEqual({ gla: { from: 1501, to: 1700 } })
    expect(one.meta?.financing).toBe('Cash Sale')
    expect(one.text?.cool).toBe('Central Electric')
    expect(d2.properties.find((p) => p.id === 'M7')).toMatchObject({ salePrice: 200007, saleDate: '2026-05-01', contractDate: '2026-04-01', values: { gla: 1507, lot_size: 6000 } })
    expect(got.datasets.find((d) => d.slot === 1)!.properties).toHaveLength(0)
  }, 60000)
  it('upserts changed sales, removes some, and clears a dataset', async () => {
    const s = await repo.createSession(db, alice, input)
    await repo.patchDataset(db, alice, s.id, 1, { upsert: [prop(1), prop(2), prop(3)] })
    await repo.patchDataset(db, alice, s.id, 1, { upsert: [prop(2, { salePrice: 999999 })], remove: ['M3'] })
    let d = (await repo.getSession(db, alice, s.id))!.datasets[0].properties
    expect(d.map((p) => p.id)).toEqual(['M1', 'M2'])
    expect(d.find((p) => p.id === 'M2')!.salePrice).toBe(999999)
    await repo.patchDataset(db, alice, s.id, 1, { clear: true })
    d = (await repo.getSession(db, alice, s.id))!.datasets[0].properties
    expect(d).toHaveLength(0)
  })
  it('rejects bad rows instead of storing them', async () => {
    const s = await repo.createSession(db, alice, input)
    await expect(repo.patchDataset(db, alice, s.id, 1, { upsert: [prop(1, { salePrice: 0 })] })).rejects.toThrow()
  })
  it('lists newest first and deletes with everything under it', async () => {
    const s = await repo.createSession(db, alice, { ...input, name: 'To delete' })
    await repo.patchDataset(db, alice, s.id, 1, { upsert: [prop(1)] })
    const list = await repo.listSessions(db, alice)
    expect(list[0].name).toBe('To delete')
    expect(await repo.deleteSession(db, alice, s.id)).toBe(true)
    expect(await repo.getSession(db, alice, s.id)).toBeNull()
    const left = await db.query('select 1 from properties p join datasets d on d.id = p.dataset_id where d.session_id = $1', [s.id])
    expect(left.rows).toHaveLength(0)
  })
})

describe('a second user gets nothing back', () => {
  it('cannot read, list, change, or delete another user\'s sessions, datasets or templates', async () => {
    const s = await repo.createSession(db, alice, { ...input, name: 'Alice only' })
    await repo.patchDataset(db, alice, s.id, 1, { upsert: [prop(1)] })
    const t = await repo.createTemplate(db, alice, { name: 'Alice template', state: 'TX', mls: 'HARMLS', propertyType: 'SFR', settings: {}, features: [], datasetNames: [] })

    expect(await repo.getSession(db, bob, s.id)).toBeNull()
    expect((await repo.listSessions(db, bob)).some((x) => x.id === s.id)).toBe(false)
    expect(await repo.patchSession(db, bob, s.id, { name: 'hacked' })).toBe(false)
    expect(await repo.patchDataset(db, bob, s.id, 1, { upsert: [prop(9)], clear: true })).toBe(false)
    expect(await repo.deleteSession(db, bob, s.id)).toBe(false)
    expect(await repo.getTemplate(db, bob, t.id)).toBeNull()
    expect(await repo.updateTemplate(db, bob, t.id, { name: 'hacked' })).toBeNull()
    expect(await repo.deleteTemplate(db, bob, t.id)).toBe(false)
    expect((await repo.listTemplates(db, bob)).some((x) => x.id === t.id)).toBe(false)
    // starting a session from someone else's template silently ignores it
    const mine = await repo.createSession(db, bob, { ...input, templateId: t.id })
    expect(mine.templateId).toBeUndefined()

    const still = (await repo.getSession(db, alice, s.id))!
    expect(still.name).toBe('Alice only')
    expect(still.datasets[0].properties).toHaveLength(1)
  })
})

describe('templates', () => {
  const widgets = { gla: { chosen: 25, done: true, locked: true, model: true, low: 1, high: 2 } }
  it('start a new session with the saved settings, features, order and dataset names, but no results', async () => {
    const t = await repo.createTemplate(db, alice, {
      name: 'Luxury', state: 'TX', mls: 'HARMLS', propertyType: 'SFR', isDefault: true, datasetNames: ['Competing', 'Broader', ''],
      settings: { transactional: { removeLeasehold: true, removeNonCash: true, removeREO: false, removeShortSale: false, deductConcessions: true, timeBasis: 'sale', timeModel: 'linear' }, commentTransactional: false },
      features: [{ key: 'lot_size' }, { key: 'gla', comment: { range: false, methods: true, extra: 'Hello' } }, { key: 'grp:cooling:Central' }],
    })
    const s = await repo.createSession(db, alice, { ...input, templateId: t.id })
    expect(s.template).toBe('Luxury')
    expect(s.templateId).toBe(t.id)
    expect(s.datasets.map((d) => d.name)).toEqual(['Competing', 'Broader', 'Dataset 3'])
    expect(s.transactional?.timeModel).toBe('linear')
    expect(s.commentTransactional).toBe(false)
    expect(Object.keys(s.widgets)).toEqual(['lot_size', 'gla', 'grp:cooling:Central'])
    expect(s.widgets.gla).toMatchObject({ chosen: null, done: false, locked: false, model: false, comment: { extra: 'Hello' } })
    void widgets
  })
  it('keeps one default per MLS and type, updates, lists and deletes', async () => {
    const a = await repo.createTemplate(db, bob, { name: 'A', state: 'TX', mls: 'HARMLS', propertyType: 'SFR', isDefault: true, settings: {}, features: [], datasetNames: [] })
    const b = await repo.createTemplate(db, bob, { name: 'B', state: 'TX', mls: 'HARMLS', propertyType: 'SFR', isDefault: true, settings: {}, features: [], datasetNames: [] })
    const list = await repo.listTemplates(db, bob, { mls: 'HARMLS', propertyType: 'SFR' })
    expect(list.filter((x) => x.isDefault).map((x) => x.name)).toEqual(['B'])
    const renamed = await repo.updateTemplate(db, bob, a.id, { name: 'A2', isDefault: true })
    expect(renamed?.name).toBe('A2')
    expect((await repo.listTemplates(db, bob)).filter((x) => x.isDefault).map((x) => x.name)).toEqual(['A2'])
    await expect(repo.createTemplate(db, bob, { name: 'B', state: 'TX', mls: 'HARMLS', propertyType: 'SFR', settings: {}, features: [], datasetNames: [] })).rejects.toThrow()
    expect(await repo.deleteTemplate(db, bob, b.id)).toBe(true)
  })
  it('deleting an account deletes everything under it', async () => {
    const id = (await db.query<{ id: string }>('insert into users (email, password_hash) values ($1, $2) returning id', ['carol@example.com', 'x'])).rows[0].id
    const s = await repo.createSession(db, id, input)
    await repo.patchDataset(db, id, s.id, 1, { upsert: [prop(1)] })
    await repo.createTemplate(db, id, { name: 'T', state: 'TX', mls: 'HARMLS', propertyType: 'SFR', settings: {}, features: [], datasetNames: [] })
    await createLogin(db, id, null)
    await repo.deleteUser(db, id)
    for (const t of ['sessions', 'templates', 'auth_sessions']) expect((await db.query(`select 1 from ${t} where user_id = $1`, [id])).rows).toHaveLength(0)
    expect((await db.query('select 1 from properties p join datasets d on d.id = p.dataset_id where d.session_id = $1', [s.id])).rows).toHaveLength(0)
  })
})
