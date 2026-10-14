import { describe, expect, it } from 'vitest'
import { FEATURES } from './features'
import { featureComment, methodsPhrase, relevantResults } from './comments'
import type { DatasetResults } from './analysis'
import type { WidgetState } from './store'

const data: DatasetResults[] = [{ slot: 1, name: 'A', count: 6, results: [
  { method: 'OLS', variant: '', value: 43, mae: 1, status: 'ok' }, { method: 'TS', variant: '', value: 41, mae: 1, status: 'ok' },
  { method: 'LAD', variant: '', value: 35, mae: 1, status: 'ok' }, { method: 'SENS', variant: '', value: 39, mae: 1, status: 'ok' },
  { method: 'GD', variant: 'avg', value: 300, mae: 1, status: 'ok' }, { method: 'TPS', variant: 'avg', value: null, mae: null, status: 'no_result' },
] }]
const w = (p: Partial<WidgetState> = {}): WidgetState => ({ chosen: 25, done: true, locked: true, model: false, low: null, high: null, ...p })

describe('comments', () => {
  it('only describes finished features', () => {
    expect(featureComment(FEATURES.gla, w({ done: false }), data)).toBeNull()
    expect(featureComment(FEATURES.gla, w({ chosen: null }), data)).toBeNull()
  })
  it('ignores results outside the limits the appraiser set', () => {
    expect(relevantResults(data, { low: null, high: 100 }).map((r) => r.value)).toEqual([43, 41, 35, 39])
  })
  it('states the value, the range of kept results and the methods', () => {
    const c = featureComment(FEATURES.gla, w({ high: 100 }), data)!
    expect(c.text).toContain('GLA adjustment is $25.00 per square foot')
    expect(c.text).toContain('from $25.00 to $43.00')
    expect(c.text).toContain('sensitivity analysis')
    expect(c.text).toContain('3 types of simple regression')
    expect(c.text).not.toContain('grouped data') // its $300 result was set aside
  })
  it('respects the include options and adds a custom sentence', () => {
    const c = featureComment(FEATURES.gla, w(), data, { range: false, methods: false, extra: 'Market supports it.' })!
    expect(c.text).toBe('The GLA adjustment is $25.00 per square foot. Market supports it.')
  })
  it('names methods in plain words', () => {
    expect(methodsPhrase([{ method: 'TPS', variant: '', value: 1, mae: 1, status: 'ok' }, { method: 'SENS', variant: '', value: 1, mae: 1, status: 'ok' }])).toBe('paired sales and sensitivity analysis')
  })
})
