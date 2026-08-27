import type { AppState } from '../src/lib/app-state'
import { describe, expect, it } from 'vitest'
import { shouldConfirmMazeReplacement } from '../src/lib/maze-replacement'

function replacementState(overrides: Partial<AppState> = {}): AppState {
  return {
    generating: false,
    generationPreview: null,
    hasGeneratedMaze: false,
    shape: null,
    ...overrides,
  } as AppState
}

describe('shouldConfirmMazeReplacement', () => {
  it('allows changing an untouched grid without confirmation', () => {
    expect(shouldConfirmMazeReplacement(replacementState())).toBe(false)
  })

  it('protects generated or edited mazes', () => {
    expect(shouldConfirmMazeReplacement(replacementState({ hasGeneratedMaze: true }))).toBe(true)
  })

  it('protects an applied image shape before generation', () => {
    expect(shouldConfirmMazeReplacement(replacementState({ shape: {} as AppState['shape'] }))).toBe(true)
  })

  it('protects active and partially advanced generation', () => {
    expect(shouldConfirmMazeReplacement(replacementState({ generating: true }))).toBe(true)
    expect(shouldConfirmMazeReplacement(replacementState({
      generationPreview: { player: { index: 1 } } as AppState['generationPreview'],
    }))).toBe(true)
  })

  it('does not protect an unadvanced generation preview', () => {
    expect(shouldConfirmMazeReplacement(replacementState({
      generationPreview: { player: { index: 0 } } as AppState['generationPreview'],
    }))).toBe(false)
  })
})
