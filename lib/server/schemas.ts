import { z } from 'zod'

const num = z.number().finite()
const nullNum = num.nullable()
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const matchRule = z.discriminatedUnion('type', [
  z.object({ type: z.literal('exact') }),
  z.object({ type: z.literal('pct'), pct: num.min(0).max(100) }),
  z.object({ type: z.literal('abs'), tol: num.min(0) }),
  z.object({ type: z.literal('identicalOrBothGreater'), n: num.min(0) }),
])
export const pairedSettings = z.object({
  features: z.record(z.string().max(60), z.object({ enabled: z.boolean(), rule: matchRule })),
  removeOutliers: z.boolean(),
})
export const transactional = z.object({
  removeLeasehold: z.boolean(), removeNonCash: z.boolean(), removeREO: z.boolean(), removeShortSale: z.boolean(), deductConcessions: z.boolean(),
  timeBasis: z.enum(['contract', 'sale']), timeModel: z.enum(['best', 'linear', 'log', 'poly2', 'poly3', 'poly4', 'none']),
})
export const commentOptions = z.object({ range: z.boolean(), methods: z.boolean(), extra: z.string().max(2000) })

export const subject = z.object({
  address: z.string().max(300), zip: z.string().max(20),
  gla: nullNum, lot_size: nullNum, baths_full: nullNum, baths_half: nullNum, stories: nullNum, garage: nullNum,
})
export const widgetState = z.object({
  chosen: nullNum, done: z.boolean(), locked: z.boolean(), model: z.boolean(), low: nullNum, high: nullNum,
  snip: z.boolean().optional(), comment: commentOptions.optional(), subject: nullNum.optional(),
})
export const widgets = z.record(z.string().min(1).max(120), widgetState).refine((w) => Object.keys(w).length <= 80, 'Too many features.')

export const storedProperty = z.object({
  id: z.string().min(1).max(64),
  salePrice: num.min(1).max(1e9),
  saleDate: iso,
  contractDate: iso.nullable(),
  status: z.string().max(30),
  values: z.record(z.string().max(80), nullNum).refine((v) => Object.keys(v).length <= 200, 'Too many values.'),
  meta: z.object({ concessions: num, financing: z.string().max(200), special: z.string().max(200), ownership: z.string().max(200) }).optional(),
  text: z.record(z.string().max(40), z.string().max(2000)).optional(),
  deleted: z.boolean().optional(),
  edits: z.record(z.string().max(60), z.object({ from: z.union([z.string().max(200), num]).nullable(), to: z.union([z.string().max(200), num]).nullable() })).optional(),
})

export const newSession = z.object({
  name: z.string().max(120), state: z.string().min(1).max(10), mls: z.string().min(1).max(40), propertyType: z.string().min(1).max(40),
  template: z.string().max(120).default('Standard'), effectiveDate: iso, templateId: z.string().uuid().optional(),
})
export const sessionPatch = z.object({
  name: z.string().min(1).max(120).optional(), effectiveDate: iso.optional(), subject: subject.nullable().optional(), widgets: widgets.optional(),
  transactional: transactional.optional(), pairedSettings: pairedSettings.optional(), commentTransactional: z.boolean().optional(),
  dataVersion: z.number().int().min(0).max(1e9).optional(), favorite: z.boolean().optional(),
}).strict()
export const datasetPatch = z.object({
  name: z.string().min(1).max(80).optional(), excludedAfterEffective: z.number().int().min(0).max(1e6).optional(), clear: z.boolean().optional(),
  upsert: z.array(storedProperty).max(5000).optional(), remove: z.array(z.string().max(64)).max(5000).optional(),
}).strict()

export const templateInput = z.object({
  name: z.string().trim().min(1).max(120), state: z.string().min(1).max(10), mls: z.string().min(1).max(40), propertyType: z.string().min(1).max(40),
  settings: z.object({ transactional: transactional.optional(), pairedSettings: pairedSettings.optional(), commentTransactional: z.boolean().optional() }),
  features: z.array(z.object({ key: z.string().min(1).max(120), comment: commentOptions.optional() })).max(80),
  datasetNames: z.array(z.string().max(80)).max(3), isDefault: z.boolean().optional(),
})

export const credentials = z.object({ email: z.string().trim().max(200).email(), password: z.string().min(1).max(200) })

export const eventsInput = z.object({
  events: z.array(z.object({
    type: z.string().regex(/^[a-z_]{1,24}(\.[a-z_]{1,32})?$/),
    detail: z.record(z.string().max(40), z.unknown()).refine((d) => JSON.stringify(d).length <= 2000, 'Detail is too long.'),
    at: z.string().datetime().optional(),
  })).min(1).max(200),
}).strict()
