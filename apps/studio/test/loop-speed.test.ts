import { describe, expect, it } from 'vitest'
import { computeLoopSpeed, getSolveRunAction } from '../src/lib/controllers/ui'

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
