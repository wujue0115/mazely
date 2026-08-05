import type { MazeSolvingStep } from 'mazely'
import type { MazePoint, MazeSolvingAlgorithm } from './maze-types'
import { cellIdToPoint } from 'mazely'
import { isSolveVisibleMultiHeadMode } from './algorithms'
import { key } from './point'

export interface SolveState {
  algorithm: MazeSolvingAlgorithm
  cameFrom: Record<string, MazePoint | null>
  end: MazePoint
  frontier: Set<string>
  frontierSize: number
  path: MazePoint[]
  start: MazePoint
  status: 'running' | 'solved' | 'unsolved'
  visited: Record<string, true>
  visitedCount: number
}

export interface SolveStepVisualResult {
  currentHeadKey: string | null
  floodVisit?: { depth: number, pointKey: string }
}

export interface RebuiltSolveVisualState {
  currentHeadKey: string | null
  floodDepthByKey: Record<string, number>
  state: SolveState
}

/** Replays buffered steps into fresh Studio-owned solve animation state. */
export function rebuildSolveVisualState(options: {
  algorithm: MazeSolvingAlgorithm
  end: MazePoint
  start: MazePoint
  steps: MazeSolvingStep[]
}): RebuiltSolveVisualState {
  const state: SolveState = {
    algorithm: options.algorithm,
    cameFrom: {},
    end: { ...options.end },
    frontier: new Set<string>(),
    frontierSize: 0,
    path: [],
    start: { ...options.start },
    status: 'running',
    visited: {},
    visitedCount: 0,
  }
  const floodDepthByKey: Record<string, number> = {}
  let currentHeadKey: string | null = key(state.start.x, state.start.y)

  for (const step of options.steps) {
    const visual = applySolveStepToState(state, step, currentHeadKey)
    currentHeadKey = visual.currentHeadKey
    if (visual.floodVisit) {
      floodDepthByKey[visual.floodVisit.pointKey] = visual.floodVisit.depth
    }
  }

  return { currentHeadKey, floodDepthByKey, state }
}

/** Folds one public solving step into Studio-owned animation state. */
export function applySolveStepToState(
  state: SolveState,
  step: MazeSolvingStep,
  currentHeadKey: string | null,
): SolveStepVisualResult {
  if (step.type === 'solve.process') {
    const currentPoint = cellIdToPoint(step.payload.current)
    const currentKey = key(currentPoint.x, currentPoint.y)
    state.frontier.delete(currentKey)
    for (const addedId of step.payload.added) {
      const addedPoint = cellIdToPoint(addedId)
      const addedKey = key(addedPoint.x, addedPoint.y)
      if (!state.visited[addedKey]) {
        state.visited[addedKey] = true
        state.visitedCount += 1
      }
      state.cameFrom[addedKey] = currentPoint
      state.frontier.add(addedKey)
    }
    state.frontierSize = state.frontier.size
    return { currentHeadKey: currentKey }
  }

  const toPoint = cellIdToPoint(step.payload.to)
  const toKey = key(toPoint.x, toPoint.y)
  if (!state.visited[toKey]) {
    state.visited[toKey] = true
    state.visitedCount += 1
  }
  state.cameFrom[toKey] = step.payload.from
    ? cellIdToPoint(step.payload.from)
    : null

  if (step.type === 'solve.flood') {
    return {
      currentHeadKey: null,
      floodVisit: { depth: step.payload.depth, pointKey: toKey },
    }
  }

  if (isSolveVisibleMultiHeadMode(state.algorithm)) {
    state.frontier.add(toKey)
    state.frontierSize = state.frontier.size
    return { currentHeadKey }
  }

  return { currentHeadKey: toKey }
}
