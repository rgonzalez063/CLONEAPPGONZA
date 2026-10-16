import type { StoredProperty } from './importer'
import type { TransactionalSettings } from './transactional'
import type { PairedSettings } from './pairedSettings'

export interface Session {
  id: string
  name: string
  state: string
  mls: string
  propertyType: string
  template: string // name of the template it started from
  templateId?: string
  effectiveDate: string
  createdAt: string
  updatedAt: string
  datasets: Dataset[]
  subject: Subject | null
  widgets: Record<string, WidgetState>
  transactional?: TransactionalSettings
  pairedSettings?: PairedSettings
  commentTransactional?: boolean
  dataVersion?: number // bumped whenever properties are edited, deleted or recovered, so results recompute
}
export interface Dataset { slot: number; name: string; properties: StoredProperty[]; excludedAfterEffective: number }
export interface Subject {
  address: string; zip: string; gla: number | null; lot_size: number | null
  baths_full: number | null; baths_half: number | null; stories: number | null; garage: number | null
  // For depreciated cost (all optional). The cost per square foot is the appraiser's own figure; no cost data ships with the app.
  quality?: string | null; condition?: string | null; effectiveAge?: number | null
  costPerSqft?: number | null; costChangePerStep?: number | null; kitchenPct?: number | null
}
export interface WidgetState {
  chosen: number | null; done: boolean; locked: boolean; model: boolean
  low: number | null; high: number | null // constraint (null = unconstrained)
  snip?: boolean
  comment?: { range: boolean; methods: boolean; extra: string }
  subject?: number | null // subject's value for features not in the subject form (default: has it)
  allocation?: number | null // percent of each sale price given to this feature, for the allocation method
}


export interface TemplateFeature { key: string; comment?: { range: boolean; methods: boolean; extra: string } }
export interface TemplateSettings { transactional?: TransactionalSettings; pairedSettings?: PairedSettings; commentTransactional?: boolean }
/** Reusable starting point for a session: settings, which features to analyze and in what order, dataset names. */
export interface Template {
  id: string
  name: string
  state: string
  mls: string
  propertyType: string
  isDefault: boolean
  settings: TemplateSettings
  features: TemplateFeature[]
  datasetNames: string[]
  createdAt: string
  updatedAt: string
}
export interface SessionSummary { id: string; name: string; mls: string; propertyType: string; effectiveDate: string; updatedAt: string; favorite: boolean }
