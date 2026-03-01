import { describe, expect, it } from 'vitest'
import { applyStoredOrdering } from './use-sidebar-agents-list'

interface OrderedItem {
  key: string
}

function item(key: string): OrderedItem {
  return { key }
}

describe('applyStoredOrdering', () => {
  it('keeps unknown items on the baseline while applying stored order', () => {
    const result = applyStoredOrdering({
      items: [item('new'), item('a'), item('b')],
      storedOrder: ['b', 'a'],
      getKey: (entry) => entry.key,
    })

    expect(result.map((entry) => entry.key)).toEqual(['new', 'b', 'a'])
  })

  it('ignores stale and duplicate stored keys', () => {
    const result = applyStoredOrdering({
      items: [item('x'), item('y')],
      storedOrder: ['missing', 'y', 'y', 'x'],
      getKey: (entry) => entry.key,
    })

    expect(result.map((entry) => entry.key)).toEqual(['y', 'x'])
  })

  it('returns baseline when there is no persisted order', () => {
    const baseline = [item('first'), item('second')]
    const result = applyStoredOrdering({
      items: baseline,
      storedOrder: [],
      getKey: (entry) => entry.key,
    })

    expect(result).toBe(baseline)
  })
})
