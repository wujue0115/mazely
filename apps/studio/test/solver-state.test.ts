import type { MazeSolvingAlgorithm } from 'mazely'
import type { SolveState } from '../src/lib/solver-state'
import { cellIdToPoint, createMaze } from 'mazely'
import { describe, expect, it } from 'vitest'
import { key } from '../src/lib/point'
import { applySolveStepToState, rebuildSolveVisualState } from '../src/lib/solver-state'

const FRONTIER_ALGORITHMS = ['bfs', 'best-first', 'a-star'] as const

describe('solve frontier animation state', () => {
  for (const algorithm of FRONTIER_ALGORITHMS) {
    it(`tracks the real ${algorithm} queue/open set and active node`, () => {
      const runtime = createBranchedMaze()
      const player = runtime.solve(algorithm, {
        end: { x: 2, y: 1 },
        start: { x: 0, y: 0 },
      })
      const state = createSolveState(algorithm)
      let currentHeadKey: string | null = key(0, 0)
      let processCount = 0

      while (player.next()) {
        const step = player.lastStep!
        if (step.type === 'solve.process') {
          const point = cellIdToPoint(step.payload.current)
          expect(state.frontier.has(key(point.x, point.y))).toBe(true)
          processCount += 1
        }

        const result = applySolveStepToState(state, step, currentHeadKey)
        currentHeadKey = result.currentHeadKey

        if (step.type === 'solve.process') {
          const current = cellIdToPoint(step.payload.current)
          for (const addedId of step.payload.added) {
            const added = cellIdToPoint(addedId)
            const addedKey = key(added.x, added.y)
            expect(state.frontier.has(addedKey)).toBe(true)
            expect(state.cameFrom[addedKey]).toEqual(current)
          }
        }
        expect(state.frontierSize).toBe(state.frontier.size)
      }

      expect(processCount).toBeGreaterThan(0)
      expect(player.steps.some(step => step.type === 'solve.expand')).toBe(false)
    })
  }

  it('keeps a queued BFS dead end visible until it is processed', () => {
    const runtime = createBranchedMaze()
    const player = runtime.solve('bfs', {
      end: { x: 2, y: 1 },
      start: { x: 0, y: 0 },
    })
    const state = createSolveState('bfs')
    let currentHeadKey: string | null = key(0, 0)
    let sawQueuedDeadEnd = false

    while (player.next()) {
      const step = player.lastStep!
      if (step.type === 'solve.process' && step.payload.current === '1:0') {
        expect(state.frontier.has(key(0, 1))).toBe(true)
        sawQueuedDeadEnd = true
      }
      currentHeadKey = applySolveStepToState(state, step, currentHeadKey).currentHeadKey
    }

    expect(sawQueuedDeadEnd).toBe(true)
  })
})

describe('solve animation rewind', () => {
  it('rebuilds the BFS frontier, parents, visits, and head at the previous cursor', () => {
    const runtime = createBranchedMaze()
    const player = runtime.solve('bfs', {
      end: { x: 2, y: 1 },
      start: { x: 0, y: 0 },
    })
    const snapshots = []
    const state = createSolveState('bfs')
    let currentHeadKey: string | null = key(0, 0)

    while (player.next()) {
      currentHeadKey = applySolveStepToState(
        state,
        player.lastStep!,
        currentHeadKey,
      ).currentHeadKey
      snapshots[player.index] = snapshotSolveVisual(state, currentHeadKey, {})
    }

    expect(player.prev()).toBe(true)
    const rebuilt = rebuildSolveVisualState({
      algorithm: 'bfs',
      end: { x: 2, y: 1 },
      start: { x: 0, y: 0 },
      steps: player.steps.slice(0, player.index),
    })

    expect(snapshotSolveVisual(
      rebuilt.state,
      rebuilt.currentHeadKey,
      rebuilt.floodDepthByKey,
    )).toEqual(snapshots[player.index])
  })

  it('rebuilds flood depths after stepping backward from completion', () => {
    const runtime = createBranchedMaze()
    const player = runtime.solve('flood', { start: { x: 0, y: 0 } })
    const snapshots = []
    const state = createSolveState('flood')
    const floodDepthByKey: Record<string, number> = {}
    let currentHeadKey: string | null = key(0, 0)

    while (player.next()) {
      const visual = applySolveStepToState(state, player.lastStep!, currentHeadKey)
      currentHeadKey = visual.currentHeadKey
      if (visual.floodVisit) {
        floodDepthByKey[visual.floodVisit.pointKey] = visual.floodVisit.depth
      }
      snapshots[player.index] = snapshotSolveVisual(state, currentHeadKey, floodDepthByKey)
    }

    expect(player.prev()).toBe(true)
    const rebuilt = rebuildSolveVisualState({
      algorithm: 'flood',
      end: { x: 2, y: 1 },
      start: { x: 0, y: 0 },
      steps: player.steps.slice(0, player.index),
    })

    expect(snapshotSolveVisual(
      rebuilt.state,
      rebuilt.currentHeadKey,
      rebuilt.floodDepthByKey,
    )).toEqual(snapshots[player.index])
  })
})

function createBranchedMaze() {
  const runtime = createMaze({ grid: { cols: 3, rows: 2, type: 'square' } })
  runtime.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, true)
  runtime.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 0, y: 1 }, true)
  runtime.setEdgeOpenedBetween({ x: 1, y: 0 }, { x: 2, y: 0 }, true)
  runtime.setEdgeOpenedBetween({ x: 2, y: 0 }, { x: 2, y: 1 }, true)
  return runtime
}

function createSolveState(algorithm: MazeSolvingAlgorithm): SolveState {
  return {
    algorithm,
    cameFrom: {},
    end: { x: 2, y: 1 },
    frontier: new Set<string>(),
    frontierSize: 0,
    path: [],
    start: { x: 0, y: 0 },
    status: 'running',
    visited: {},
    visitedCount: 0,
  }
}

function snapshotSolveVisual(
  state: SolveState,
  currentHeadKey: string | null,
  floodDepthByKey: Record<string, number>,
) {
  return {
    cameFrom: { ...state.cameFrom },
    currentHeadKey,
    floodDepthByKey: { ...floodDepthByKey },
    frontier: [...state.frontier].sort(),
    frontierSize: state.frontierSize,
    visited: { ...state.visited },
    visitedCount: state.visitedCount,
  }
}
