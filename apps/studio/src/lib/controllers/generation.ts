import type { Maze, MazeGenerationStep, StepPlayer } from 'mazely'
import type { MazeGenerationAlgorithm, MazePoint, MazeViewState } from '../maze-types'
import { cellIdToPoint } from 'mazely'
import { key } from '../point'

/**
 * Live view of an in-progress generation. All fields are derived from the
 * real step stream: each applied step's payload names the carve direction.
 */
export interface GenerationPreview {
  algorithm: MazeGenerationAlgorithm
  runtime: Maze
  player: StepPlayer<MazeGenerationStep>
  view: MazeViewState
  discoveredKeys: Set<string>
  discoveredCount: number
  parentByKey: Record<string, string | null>
  currentHeadKey: string | null
  huntScanRow: number | null
  lastCarveKeys: string[]
}

export function createGenerationPreview(options: {
  algorithm: MazeGenerationAlgorithm
  runtime: Maze
  player: StepPlayer<MazeGenerationStep>
  view: MazeViewState
}): GenerationPreview {
  return {
    algorithm: options.algorithm,
    currentHeadKey: null,
    discoveredCount: 0,
    discoveredKeys: new Set<string>(),
    huntScanRow: null,
    lastCarveKeys: [],
    parentByKey: {},
    player: options.player,
    runtime: options.runtime,
    view: options.view,
  }
}

/**
 * Applies the next real generation step and folds its payload into the
 * preview state. Returns the points discovered by this step, or null when
 * the generation is already finished.
 */
export function advanceGenerationPreview(preview: GenerationPreview): MazePoint[] | null {
  const stepIndex = preview.player.index
  if (!preview.player.next()) {
    return null
  }

  const step = preview.player.steps[stepIndex]
  if (step.type === 'hunt-scan') {
    const row = step.payload.row
    preview.currentHeadKey = null
    preview.huntScanRow = Number.isInteger(row) ? row : null
    preview.lastCarveKeys = []
    return []
  }
  const payload = step.payload
  if (!payload?.to) {
    return []
  }

  preview.huntScanRow = null
  const toPoint = cellIdToPoint(String(payload.to))
  const toKey = key(toPoint.x, toPoint.y)
  const fromPoint = payload.from ? cellIdToPoint(String(payload.from)) : null
  const fromKey = fromPoint ? key(fromPoint.x, fromPoint.y) : null

  const discovered: MazePoint[] = []
  if (fromPoint && fromKey && !preview.discoveredKeys.has(fromKey)) {
    preview.discoveredKeys.add(fromKey)
    preview.discoveredCount += 1
    preview.parentByKey[fromKey] ??= null
    discovered.push(fromPoint)
  }
  if (!preview.discoveredKeys.has(toKey)) {
    preview.discoveredKeys.add(toKey)
    preview.discoveredCount += 1
    discovered.push(toPoint)
  }

  preview.parentByKey[toKey] ??= fromKey
  preview.currentHeadKey = toKey
  preview.lastCarveKeys = fromKey ? [fromKey, toKey] : [toKey]
  return discovered
}

export function isGenerationPreviewDone(preview: GenerationPreview): boolean {
  return preview.player.done
}

export function getHuntScanSegment(
  preview: GenerationPreview | null,
): { from: MazePoint, to: MazePoint } | null {
  if (preview?.algorithm !== 'hunt-and-kill' || preview.huntScanRow === null) {
    return null
  }
  return {
    from: { x: -0.5, y: preview.huntScanRow },
    to: { x: preview.view.cols - 0.5, y: preview.huntScanRow },
  }
}
