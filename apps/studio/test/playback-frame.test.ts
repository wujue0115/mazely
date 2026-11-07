import { describe, expect, it } from 'vitest'
import { advancePlaybackFrame } from '../src/lib/playback-frame'

function frame(overrides: Partial<Parameters<typeof advancePlaybackFrame>[0]> = {}) {
  let steps = 0
  const result = advancePlaybackFrame({ elapsed: 0, delta: 16, delay: 20, batchSize: 1, done: () => false, advance: () => {
    steps += 1
    return true
  }, now: () => 0, ...overrides })
  return { ...result, steps }
}

describe('playback frame budget', () => {
  it('preserves fractional elapsed time and normal slow playback', () => {
    expect(frame()).toEqual({ elapsed: 16, advanced: false, steps: 0 })
    expect(frame({ elapsed: 16 })).toEqual({ elapsed: 12, advanced: true, steps: 1 })
    expect(frame({ elapsed: 2990, delta: 16, delay: 3000 })).toEqual({ elapsed: 6, advanced: true, steps: 1 })
  })

  it('bounds catch-up after returning from a background tab', () => {
    const result = frame({ delta: 60000, delay: 1 })
    expect(result.steps).toBe(64)
    expect(result.elapsed).toBeLessThanOrEqual(1)
  })

  it('yields when expensive steps consume the time budget', () => {
    let time = 0
    const result = frame({ delta: 100, delay: 1, now: () => time, advance: () => {
      time += 5
      return true
    } })
    expect(time).toBe(10)
    expect(result.advanced).toBe(true)
    expect(result.elapsed).toBeLessThanOrEqual(1)
  })

  it('does not charge animation time or request redraws for work checkpoints', () => {
    let steps = 0
    const result = frame({
      elapsed: 20,
      delta: 0,
      advance: () => {
        steps += 1
        return true
      },
      isWorkStep: () => steps <= 3,
    })
    expect(steps).toBe(4)
    expect(result.elapsed).toBe(0)
    expect(result.advanced).toBe(true)
    const busy = frame({ delta: 100, delay: 1, isWorkStep: () => true })
    expect(busy.steps).toBe(1024)
    expect(busy.advanced).toBe(false)
  })

  it('also bounds batches and stops at completion', () => {
    let steps = 0
    advancePlaybackFrame({ elapsed: 0, delta: 60000, delay: 1, batchSize: 1000, now: () => 0, done: () => steps >= 3, advance: () => {
      steps += 1
      return true
    } })
    expect(steps).toBe(3)
    expect(frame({ delta: 100, delay: 1, batchSize: 1000 }).steps).toBe(64)
  })
})
