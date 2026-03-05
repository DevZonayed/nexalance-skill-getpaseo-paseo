import { describe, expect, it } from 'vitest'
import { resolveStatusControlMode } from './agent-input-area.status-controls'

describe('resolveStatusControlMode', () => {
  it('uses ready mode when no controlled status controls are provided', () => {
    expect(resolveStatusControlMode(undefined)).toBe('ready')
  })

  it('uses draft mode when controlled status controls are provided', () => {
    expect(
      resolveStatusControlMode({
        providerDefinitions: [],
        selectedProvider: 'codex',
        onSelectProvider: () => undefined,
        modeOptions: [],
        selectedMode: '',
        onSelectMode: () => undefined,
        models: [],
        selectedModel: '',
        onSelectModel: () => undefined,
        isModelLoading: false,
        thinkingOptions: [],
        selectedThinkingOptionId: '',
        onSelectThinkingOption: () => undefined,
      })
    ).toBe('draft')
  })
})
