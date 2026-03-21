import { describe, expect, it } from 'vitest'

import { isInteractiveDesktopDragTarget } from './desktop-window'

function createTarget(input: { matchesSelector: (selector: string) => boolean }): EventTarget {
  return {
    closest: (selector: string) => (input.matchesSelector(selector) ? ({} as Element) : null),
  } as unknown as EventTarget
}

describe('isInteractiveDesktopDragTarget', () => {
  it('treats focusable pressables as interactive drag exemptions', () => {
    const target = createTarget({
      matchesSelector: (selector) => selector.includes('[tabindex]'),
    })

    expect(isInteractiveDesktopDragTarget(target)).toBe(true)
  })

  it('treats semantic button targets as interactive drag exemptions', () => {
    const target = createTarget({
      matchesSelector: (selector) => selector.includes("[role='button']"),
    })

    expect(isInteractiveDesktopDragTarget(target)).toBe(true)
  })

  it('returns false for non-interactive targets', () => {
    const target = createTarget({
      matchesSelector: () => false,
    })

    expect(isInteractiveDesktopDragTarget(target)).toBe(false)
  })

  it('returns false when the target does not support closest()', () => {
    expect(isInteractiveDesktopDragTarget(null)).toBe(false)
    expect(isInteractiveDesktopDragTarget({} as EventTarget)).toBe(false)
  })
})
