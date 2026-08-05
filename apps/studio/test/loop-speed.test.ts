import { describe, expect, it } from 'vitest'
import {
  computeLoopSpeed,
  getGenerationPlaybackStatus,
  getSolveRunAction,
  getSolveStepAction,
  getStepButtonState,
} from '../src/lib/controllers/ui'

describe('computeLoopSpeed', () => {
  it('runs one step per tick at the selected millisecond delay', () => {
    expect(computeLoopSpeed(1)).toEqual({ stepBatchSize: 1, stepDelay: 1 })
    expect(computeLoopSpeed(20)).toEqual({ stepBatchSize: 1, stepDelay: 20 })
    expect(computeLoopSpeed(3000)).toEqual({ stepBatchSize: 1, stepDelay: 3000 })
  })

  it('rounds fractional delays', () => {
    expect(computeLoopSpeed(2.4)).toEqual({ stepBatchSize: 1, stepDelay: 2 })
    expect(computeLoopSpeed(2.5)).toEqual({ stepBatchSize: 1, stepDelay: 3 })
  })

  it('clamps out-of-range values', () => {
    expect(computeLoopSpeed(-10)).toEqual({ stepBatchSize: 1, stepDelay: 1 })
    expect(computeLoopSpeed(9999)).toEqual({ stepBatchSize: 1, stepDelay: 3000 })
  })
})

describe('getSolveRunAction', () => {
  it('starts an idle animation and pauses a running animation', () => {
    expect(getSolveRunAction(false, 'running')).toBe('start')
    expect(getSolveRunAction(true, 'running')).toBe('pause')
  })

  it('restarts completed solve animations', () => {
    expect(getSolveRunAction(false, 'solved')).toBe('restart')
    expect(getSolveRunAction(false, 'unsolved')).toBe('restart')
  })
})

describe('getStepButtonState', () => {
  it('enables previous only after a paused generation step', () => {
    expect(getStepButtonState({
      activeTab: 'generate',
      generating: false,
      generationDone: false,
      generationStepIndex: 1,
      running: false,
      solveStepIndex: 0,
    })).toEqual({ previousDisabled: false, stepDisabled: false })
  })

  it('keeps both directions enabled after generation completion', () => {
    expect(getStepButtonState({
      activeTab: 'generate',
      generating: false,
      generationDone: true,
      generationStepIndex: 20,
      running: false,
      solveStepIndex: 0,
    })).toEqual({ previousDisabled: false, stepDisabled: false })
  })

  it('keeps forward step enabled after solve completion', () => {
    expect(getStepButtonState({
      activeTab: 'solve',
      generating: false,
      generationDone: false,
      generationStepIndex: 0,
      running: false,
      solveStepIndex: 8,
    })).toEqual({ previousDisabled: false, stepDisabled: false })
  })

  it('disables both step directions during playback and editing', () => {
    expect(getStepButtonState({
      activeTab: 'solve',
      generating: false,
      generationDone: false,
      generationStepIndex: 0,
      running: true,
      solveStepIndex: 8,
    })).toEqual({ previousDisabled: true, stepDisabled: true })
    expect(getStepButtonState({
      activeTab: 'edit',
      generating: false,
      generationDone: false,
      generationStepIndex: 0,
      running: false,
      solveStepIndex: 8,
    })).toEqual({ previousDisabled: true, stepDisabled: true })
  })
})

describe('getSolveStepAction', () => {
  it('restarts completed solves before stepping', () => {
    expect(getSolveStepAction('running')).toBe('step')
    expect(getSolveStepAction('solved')).toBe('restart')
    expect(getSolveStepAction('unsolved')).toBe('restart')
  })
})

describe('getGenerationPlaybackStatus', () => {
  it('reports generated after generation completes', () => {
    expect(getGenerationPlaybackStatus({
      generating: false,
      generationDone: true,
      hasGeneratedMaze: true,
      hasGenerationPreview: true,
    })).toBe('generated')
  })

  it('reports generated for a committed maze without playback history', () => {
    expect(getGenerationPlaybackStatus({
      generating: false,
      generationDone: false,
      hasGeneratedMaze: true,
      hasGenerationPreview: false,
    })).toBe('generated')
  })
})
