const FRAME_BUDGET_MS = 8
const MAX_STEPS_PER_FRAME = 64
const MAX_WORK_STEPS_PER_FRAME = 1024
const MAX_CATCH_UP_MS = 100

/** Bound catch-up work so playback yields to input and rendering every frame. */
export function advancePlaybackFrame(options: {
  elapsed: number
  delta: number
  delay: number
  batchSize: number
  done: () => boolean
  advance: () => boolean
  isWorkStep?: () => boolean
  now?: () => number
}): { elapsed: number, advanced: boolean } {
  const now = options.now ?? (() => performance.now())
  const started = now()
  const delay = Math.max(1, options.delay)
  let elapsed = Math.min(options.elapsed + Math.max(0, options.delta), Math.max(delay, MAX_CATCH_UP_MS) + Math.min(delay, MAX_CATCH_UP_MS))
  let steps = 0
  let workSteps = 0
  let advanced = false
  while (elapsed >= delay && !options.done()) {
    elapsed -= delay
    let visualTick = false
    for (let batch = 0; batch < options.batchSize && !options.done(); batch += 1) {
      if (steps >= MAX_STEPS_PER_FRAME || workSteps >= MAX_WORK_STEPS_PER_FRAME || (steps + workSteps > 0 && now() - started >= FRAME_BUDGET_MS)) {
        return { elapsed: Math.min(elapsed, delay), advanced }
      }
      if (!options.advance())
        return { elapsed: 0, advanced }
      if (options.isWorkStep?.()) {
        workSteps += 1
      }
      else {
        steps += 1
        visualTick = true
        advanced = true
      }
    }
    if (!visualTick)
      elapsed += delay
  }
  return { elapsed, advanced }
}
