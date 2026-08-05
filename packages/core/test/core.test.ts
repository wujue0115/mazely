import { describe, expect, it, vi } from 'vitest'
import {
  applySerializedGrid,
  areCellsDirectlyLinked,
  cellIdToPoint,
  getReachableCellIds,
  isMazeGenerationAlgorithm,
  isMazeSolvingAlgorithm,
  MAZE_GENERATION_ALGORITHMS,
  MAZE_SOLVING_ALGORITHMS,
  Mazely,
  serializeGrid,
  traverseGrid,
} from '../src'

function openedEdgeCount(grid: Mazely['grid']): number {
  return grid.edges.filter(edge => edge.opened).length
}

function snapshotState(maze: Mazely): string {
  const edges = maze.grid.edges
    .map(edge => `${edge.id}:${Number(edge.opened)}`)
    .sort()
    .join('|')
  const meta = maze.grid.cells
    .map(cell => `${cell.id}=${JSON.stringify([...cell.meta.entries()].sort())}`)
    .join('|')
  return `${edges}#${meta}`
}

describe('@mazely/core', () => {
  it('exposes stable algorithm registries and runtime guards', () => {
    expect(MAZE_GENERATION_ALGORITHMS).toContain('hunt-and-kill')
    expect(MAZE_SOLVING_ALGORITHMS).toEqual(['a-star', 'best-first', 'bfs', 'dfs', 'flood'])
    expect(isMazeGenerationAlgorithm('wilson')).toBe(true)
    expect(isMazeGenerationAlgorithm('unknown')).toBe(false)
    expect(isMazeSolvingAlgorithm('a-star')).toBe(true)
    expect(isMazeSolvingAlgorithm(null)).toBe(false)
  })

  it('supports reversible steps with next/prev/reset', () => {
    const maze = new Mazely({
      grid: { cols: 4, rows: 4, type: 'square' },
      seed: 42,
    })
    const player = maze.generate('dfs')
    const initial = snapshotState(maze)

    expect(openedEdgeCount(maze.grid)).toBe(0)
    expect(player.next(3)).toBe(true)
    expect(player.index).toBe(3)
    expect(openedEdgeCount(maze.grid)).toBeGreaterThan(0)

    expect(player.prev(2)).toBe(true)
    expect(player.index).toBe(1)

    player.reset()
    expect(player.index).toBe(0)
    expect(snapshotState(maze)).toBe(initial)
  })

  it('does not materialize generation steps before playback starts', () => {
    const maze = new Mazely({
      grid: { cols: 20, rows: 20, type: 'square' },
      seed: 'lazy',
    })
    const player = maze.generate('dfs')

    expect(player.steps.length).toBe(0)

    expect(player.next()).toBe(true)
    expect(player.steps.length).toBeLessThan(400)

    player.finish()
    expect(player.done).toBe(true)
    expect(openedEdgeCount(maze.grid)).toBe(399)
  })

  it('emits the complete Aldous-Broder random walk while carving only first visits', () => {
    const maze = new Mazely({
      grid: { cols: 4, rows: 4, type: 'square' },
      seed: 'aldous-walk',
    })
    const player = maze.generate('aldous-broder')

    player.finish()

    expect(player.steps[0]).toMatchObject({
      patches: [],
      payload: { to: expect.any(String) },
      type: 'visit',
    })
    expect(player.steps.filter(step => step.type === 'carve')).toHaveLength(15)

    const revisitSteps = player.steps.filter(
      step => step.type === 'visit' && step.payload.from,
    )
    expect(revisitSteps.length).toBeGreaterThan(0)
    for (const step of revisitSteps) {
      const from = maze.grid.getCell(step.payload.from!)
      expect(from?.getNeighbors().some(cell => cell.id === step.payload.to)).toBe(true)
    }
  })

  it('reports an exact total only after the lazy step source is exhausted', () => {
    const maze = new Mazely({
      grid: { cols: 4, rows: 4, type: 'square' },
      seed: 'progress',
    })
    const player = maze.generate('dfs')

    expect(player.progress).toMatchObject({
      done: false,
      index: 0,
      totalSteps: null,
    })

    player.finish()
    expect(player.progress).toEqual({
      bufferedSteps: player.steps.length,
      done: true,
      index: player.steps.length,
      totalSteps: player.steps.length,
    })
  })

  it('reports binary-tree carve steps toward the current cell inside a mask', () => {
    const T = true
    const F = false
    const mask = [
      [F, F, T, F, F],
      [F, F, T, F, F],
      [T, T, T, T, T],
      [F, F, T, F, F],
      [F, F, T, F, F],
    ]
    const maze = new Mazely({
      grid: { cols: 5, mask, rows: 5, type: 'square' },
      seed: 'binary-tree-direction',
    })
    const player = maze.generate('binary-tree')

    player.finish()

    const carveSteps = player.steps.filter(step => step.type === 'carve')
    expect(carveSteps).toHaveLength(8)
    for (const step of carveSteps) {
      const from = cellIdToPoint(step.payload.from!)
      const to = cellIdToPoint(step.payload.to)
      expect(to.y > from.y || (to.y === from.y && to.x > from.x)).toBe(true)
    }
  })

  it('restores the exact initial state after a full round trip', () => {
    const maze = new Mazely({
      grid: { cols: 5, rows: 5, type: 'square' },
      seed: 'round-trip',
    })
    const player = maze.generate('kruskal')
    const initial = snapshotState(maze)

    player.finish()
    expect(player.done).toBe(true)
    expect(snapshotState(maze)).not.toBe(initial)

    while (player.prev()) {
      // rewind
    }
    expect(player.index).toBe(0)
    expect(snapshotState(maze)).toBe(initial)
  })

  it('emits complete exactly once when the last step is applied', () => {
    const maze = new Mazely({
      grid: { cols: 3, rows: 3, type: 'square' },
      seed: 1,
    })
    const player = maze.generate('dfs')

    let completes = 0
    maze.on('complete', () => completes += 1)

    player.finish()
    expect(completes).toBe(1)

    expect(player.next()).toBe(false)
    expect(player.next()).toBe(false)
    expect(completes).toBe(1)

    player.prev()
    player.next()
    expect(completes).toBe(2)
  })

  it('emits step/reset/complete events in expected order', () => {
    const maze = new Mazely({
      grid: { cols: 3, rows: 3, type: 'square' },
      seed: 7,
    })
    const player = maze.generate('dfs')

    const events: string[] = []
    maze.on('step', ({ state }) => events.push(`step:${state.index}`))
    maze.on('reset', ({ state }) => events.push(`reset:${state.index}`))
    maze.on('complete', ({ state }) => events.push(`complete:${state.index}`))

    player.next()
    player.next()
    player.finish()
    player.reset()

    expect(events[0]).toBe('step:1')
    expect(events[1]).toBe('step:2')
    expect(events.at(-2)).toBe(`complete:${player.total}`)
    expect(events.at(-1)).toBe('reset:0')
  })

  it('is deterministic with the same seed for all generation algorithms', () => {
    const algorithms = [
      'aldous-broder',
      'binary-tree',
      'dfs',
      'eller',
      'growing-tree',
      'hunt-and-kill',
      'kruskal',
      'prim',
      'recursive-division',
      'sidewinder',
      'traversal',
      'wilson',
    ] as const

    for (const algorithm of algorithms) {
      const build = () => {
        const maze = new Mazely({
          grid: { cols: 8, rows: 8, type: 'square' },
          seed: 'fixed-seed',
        })
        maze.generate(algorithm).finish()
        return maze
      }

      const first = build()
      const second = build()

      expect(serializeGrid(first.grid)).toEqual(serializeGrid(second.grid))
      expect(openedEdgeCount(first.grid)).toBeGreaterThan(0)
    }
  })

  it('uses a fresh random seed when no seed is provided', () => {
    const random = vi.spyOn(Math, 'random')
    random.mockReturnValueOnce(0.1).mockReturnValueOnce(0.9)

    try {
      const build = () => {
        const maze = new Mazely({
          grid: { cols: 8, rows: 8, type: 'square' },
        })
        maze.generate('recursive-division').finish()
        return serializeGrid(maze.grid)
      }

      expect(build()).not.toEqual(build())
    }
    finally {
      random.mockRestore()
    }
  })

  it('emits row-by-row scan steps while hunt-and-kill searches for a new branch', () => {
    const maze = new Mazely({
      grid: { cols: 8, rows: 8, type: 'square' },
      seed: 'hunt-scan',
    })
    const player = maze.generate('hunt-and-kill')

    player.finish()

    const scanSteps = player.steps.filter(step => step.type === 'hunt-scan')
    expect(scanSteps.length).toBeGreaterThan(0)
    expect(scanSteps.every(step => step.patches.length === 0)).toBe(true)

    let previousWasScan = false
    let previousRow = -1
    for (const step of player.steps) {
      if (step.type !== 'hunt-scan') {
        previousWasScan = false
        continue
      }
      const row = Number(step.payload?.row)
      expect(row).toBe(previousWasScan ? previousRow + 1 : 0)
      previousWasScan = true
      previousRow = row
    }

    expect(openedEdgeCount(maze.grid)).toBe(63)
  })

  it('starts recursive division from an open grid and adds walls', () => {
    const maze = new Mazely({
      grid: { cols: 5, rows: 5, type: 'square' },
      seed: 'division',
    })
    const player = maze.generate('recursive-division')

    expect(openedEdgeCount(maze.grid)).toBe(40)
    expect(player.next()).toBe(true)
    expect(openedEdgeCount(maze.grid)).toBeLessThan(40)
  })

  it('supports solve algorithms on a carved square grid', () => {
    const generated = new Mazely({
      grid: { cols: 10, rows: 10, type: 'square' },
      seed: 11,
    })
    generated.generate('dfs').finish()
    const carved = serializeGrid(generated.grid)

    const algorithms = ['dfs', 'bfs', 'best-first', 'a-star'] as const
    for (const algorithm of algorithms) {
      const maze = new Mazely({
        grid: { cols: 10, rows: 10, type: 'square' },
      })
      applySerializedGrid(maze.grid, carved)

      maze.solve(algorithm, { end: { x: 9, y: 9 }, start: { x: 0, y: 0 } }).finish()
      const solved = maze.getSolveResult()!

      expect(solved.algorithm).toBe(algorithm)
      expect(solved.solved).toBe(true)
      expect(solved.path[0]).toEqual({ x: 0, y: 0 })
      expect(solved.path.at(-1)).toEqual({ x: 9, y: 9 })
      expect(solved.visitedCount).toBeGreaterThan(0)
    }
  })

  it('emits process steps when queue-based solvers select an active node', () => {
    for (const algorithm of ['bfs', 'best-first', 'a-star'] as const) {
      const maze = new Mazely({ grid: { cols: 2, rows: 2, type: 'square' } })
      maze.openAllEdges()
      const player = maze.solve(algorithm, {
        end: { x: 1, y: 1 },
        start: { x: 0, y: 0 },
      })

      player.finish()

      const processSteps = player.steps.filter(step => step.type === 'solve.process')
      expect(processSteps.length).toBeGreaterThan(0)
      expect(processSteps[0].payload.current).toBe('0:0')
      expect(processSteps[0].payload.added.length).toBeGreaterThan(0)
      expect(player.steps.some(step => step.type === 'solve.expand')).toBe(false)
    }
  })

  it('keeps DFS on visit and expand steps without a frontier process step', () => {
    const maze = new Mazely({ grid: { cols: 2, rows: 2, type: 'square' } })
    maze.openAllEdges()
    const player = maze.solve('dfs', {
      end: { x: 1, y: 1 },
      start: { x: 0, y: 0 },
    })

    player.finish()

    expect(player.steps.some(step => step.type === 'solve.expand')).toBe(true)
    expect(player.steps.some(step => step.type === 'solve.process')).toBe(false)
  })

  it('applies and reverses all discoveries in one process step', () => {
    const maze = new Mazely({ grid: { cols: 2, rows: 2, type: 'square' } })
    maze.openAllEdges()
    const player = maze.solve('bfs', {
      end: { x: 1, y: 1 },
      start: { x: 0, y: 0 },
    })

    player.next()
    player.next()
    const process = player.lastStep!
    expect(process.type).toBe('solve.process')
    if (process.type !== 'solve.process')
      return

    for (const cellId of process.payload.added) {
      expect(maze.grid.getCell(cellId)?.getMeta('solve.visited')).toBe(true)
      expect(maze.grid.getCell(cellId)?.getMeta('solve.parentId')).toBe(process.payload.current)
    }

    player.prev()
    for (const cellId of process.payload.added) {
      expect(maze.grid.getCell(cellId)?.getMeta('solve.visited')).toBeUndefined()
      expect(maze.grid.getCell(cellId)?.getMeta('solve.parentId')).toBeUndefined()
    }
  })

  it('floods every reachable cell with BFS depth and no end point', () => {
    const maze = new Mazely({ grid: { cols: 3, rows: 2, type: 'square' } })
    maze.openAllEdges()

    const player = maze.solve('flood', { start: { x: 0, y: 0 } })
    player.finish()

    expect(player.steps.map(step => step.type)).toEqual(
      Array.from({ length: 6 }, () => 'solve.flood'),
    )
    expect(player.steps.map(step => step.payload.depth)).toEqual([0, 1, 1, 2, 2, 3])
    expect(maze.getSolveResult()).toEqual({
      algorithm: 'flood',
      path: [],
      solved: true,
      visitedCount: 6,
    })
  })

  it('requires an end point for non-flood solving algorithms', () => {
    const maze = new Mazely({ grid: { cols: 2, rows: 2, type: 'square' } })

    // @ts-expect-error Runtime validation still protects untyped JavaScript callers.
    expect(() => maze.solve('bfs', { start: { x: 0, y: 0 } }))
      .toThrowError(/requires an end point/)
  })

  it('edits edges and cells through the core API', () => {
    const maze = new Mazely({ grid: { cols: 3, rows: 3, type: 'square' } })

    maze.openAllEdges()
    expect(openedEdgeCount(maze.grid)).toBe(12)

    maze.closeCell({ x: 1, y: 1 })
    expect(openedEdgeCount(maze.grid)).toBe(8)
    expect(maze.grid.getCell('1:1')!.getEdges().every(edge => !edge.opened)).toBe(true)

    maze.openCell({ x: 1, y: 1 })
    expect(openedEdgeCount(maze.grid)).toBe(12)

    maze.closeAllEdges()
    expect(openedEdgeCount(maze.grid)).toBe(0)

    maze.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, true)
    expect(openedEdgeCount(maze.grid)).toBe(1)

    const edgeId = maze.grid.getCell('0:0')!.edges.right!.id
    maze.setEdgeOpened(edgeId, false)
    expect(openedEdgeCount(maze.grid)).toBe(0)
  })

  it('batches edits, emits edit once, and clears solve state', () => {
    const maze = new Mazely({
      grid: { cols: 4, rows: 4, type: 'square' },
      seed: 'editable',
    })
    maze.generate('dfs').finish()
    maze.solve('bfs', { end: { x: 3, y: 3 }, start: { x: 0, y: 0 } }).finish()
    expect(maze.getSolveResult()).toBeDefined()

    const events: string[] = []
    maze.on('edit', ({ state }) => events.push(`edit:${state.phase}:${state.index}`))
    maze.on('phaseChange', ({ state }) => events.push(`phase:${state.phase}`))

    maze.edit((editor) => {
      editor.closeAllEdges()
      editor.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, true)
      editor.setEdgeOpenedBetween({ x: 1, y: 0 }, { x: 2, y: 0 }, true)
    })

    expect(openedEdgeCount(maze.grid)).toBe(2)
    expect(maze.getSolveResult()).toBeUndefined()
    expect(maze.getState()).toMatchObject({
      done: false,
      generationAlgorithm: undefined,
      index: 0,
      phase: 'idle',
      solvingAlgorithm: undefined,
      totalSteps: 0,
    })
    expect(events).toEqual(['phase:idle', 'edit:idle:0'])
  })

  it('applies batched edits atomically', () => {
    const maze = new Mazely({
      grid: { cols: 3, rows: 3, type: 'square' },
      seed: 'atomic-edit',
    })
    maze.generate('dfs').finish()
    const before = snapshotState(maze)
    const events = vi.fn()
    maze.on('edit', events)

    expect(() => maze.edit((editor) => {
      editor.closeAllEdges()
      editor.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 2, y: 0 }, true)
    })).toThrowError(RangeError)

    expect(snapshotState(maze)).toBe(before)
    expect(maze.getState().phase).toBe('generate')
    expect(events).not.toHaveBeenCalled()
  })

  it('discards staged edits when the callback throws', () => {
    const maze = new Mazely({ grid: { cols: 3, rows: 3, type: 'square' } })
    const before = snapshotState(maze)

    expect(() => maze.edit((editor) => {
      editor.openAllEdges()
      throw new Error('cancel')
    })).toThrowError('cancel')

    expect(snapshotState(maze)).toBe(before)
    expect(maze.getState().phase).toBe('idle')
  })

  it('clears solve state without changing the generated maze', () => {
    const maze = new Mazely({
      grid: { cols: 4, rows: 4, type: 'square' },
      seed: 'clear-solve',
    })
    maze.generate('dfs').finish()
    const generated = serializeGrid(maze.grid)
    maze.solve('bfs', { end: { x: 3, y: 3 }, start: { x: 0, y: 0 } }).finish()
    expect(maze.getSolveResult()).toBeDefined()

    maze.clearSolveState()

    expect(serializeGrid(maze.grid)).toEqual(generated)
    expect(maze.getSolveResult()).toBeUndefined()
    expect(maze.getState().phase).toBe('idle')
  })

  it('rejects edits while playback is unfinished', () => {
    const maze = new Mazely({
      grid: { cols: 4, rows: 4, type: 'square' },
      seed: 2,
    })
    const player = maze.generate('dfs')
    player.next()

    expect(() => maze.openAllEdges()).toThrowError(/playback is unfinished/)

    player.reset()
    expect(() => maze.openAllEdges()).not.toThrow()
  })

  it('validates edit edge and point targets', () => {
    const maze = new Mazely({ grid: { cols: 3, rows: 3, type: 'square' } })

    expect(() => maze.setEdgeOpened('missing', true)).toThrowError(RangeError)
    expect(() => maze.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 2, y: 0 }, true))
      .toThrowError(RangeError)
    expect(() => maze.openCell({ x: 3, y: 0 })).toThrowError(RangeError)
  })

  it('finds the shortest path with a-star and bfs on grids with loops', () => {
    const openEverything = (maze: Mazely) => {
      applySerializedGrid(maze.grid, {
        cols: 5,
        openedEdgeIds: maze.grid.edges.map(edge => edge.id),
        rows: 5,
      })
    }

    for (const algorithm of ['a-star', 'bfs'] as const) {
      const maze = new Mazely({ grid: { cols: 5, rows: 5, type: 'square' } })
      openEverything(maze)
      maze.solve(algorithm, { end: { x: 4, y: 4 }, start: { x: 0, y: 0 } }).finish()

      const result = maze.getSolveResult()!
      expect(result.solved).toBe(true)
      // Manhattan distance 8 -> 9 cells on any shortest path.
      expect(result.path.length).toBe(9)
    }
  })

  it('reports an unsolvable maze without throwing', () => {
    const maze = new Mazely({ grid: { cols: 3, rows: 3, type: 'square' } })
    maze.solve('bfs', { end: { x: 2, y: 2 }, start: { x: 0, y: 0 } }).finish()

    const result = maze.getSolveResult()!
    expect(result.solved).toBe(false)
    expect(result.path).toEqual([])
  })

  it('traverses reachable open cells with breadth-first and depth-first depth', () => {
    const maze = new Mazely({ grid: { cols: 2, rows: 2, type: 'square' } })
    maze.openAllEdges()

    const breadthFirst = traverseGrid(maze.grid, {
      startCellId: '0:0',
      strategy: 'bfs',
    })
    const depthFirst = traverseGrid(maze.grid, {
      startCellId: '0:0',
      strategy: 'dfs',
    })

    expect(breadthFirst).toHaveLength(4)
    expect(breadthFirst[0]).toEqual({ cellId: '0:0', depth: 0, parentId: null })
    expect(Math.max(...breadthFirst.map(visit => visit.depth))).toBe(2)
    expect(Math.max(...depthFirst.map(visit => visit.depth))).toBe(3)
  })

  it('rejects traversal from a missing cell without mutating the grid', () => {
    const maze = new Mazely({ grid: { cols: 2, rows: 2, type: 'square' } })
    const before = snapshotState(maze)

    expect(() => traverseGrid(maze.grid, {
      startCellId: 'missing',
      strategy: 'bfs',
    })).toThrowError(RangeError)
    expect(snapshotState(maze)).toBe(before)
  })

  it('queries linked neighbors and reachable cells without square-coordinate logic', () => {
    const maze = new Mazely({ grid: { cols: 3, rows: 2, type: 'square' } })
    maze.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, true)
    maze.setEdgeOpenedBetween({ x: 1, y: 0 }, { x: 1, y: 1 }, true)

    expect(areCellsDirectlyLinked(maze.grid, '0:0', '0:1')).toBe(true)
    expect(areCellsDirectlyLinked(maze.grid, '0:0', '1:0')).toBe(false)
    expect(getReachableCellIds(maze.grid, '0:0')).toEqual(
      new Set(['0:0', '0:1', '1:1']),
    )
  })

  it('throws when solving before generation is finished', () => {
    const maze = new Mazely({
      grid: { cols: 4, rows: 4, type: 'square' },
      seed: 2,
    })
    maze.generate('dfs')

    expect(() => maze.solve('bfs', { end: { x: 3, y: 3 }, start: { x: 0, y: 0 } }))
      .toThrowError(/generation is unfinished/)
  })

  it('throws on out-of-bounds start and end points', () => {
    const maze = new Mazely({ grid: { cols: 4, rows: 4, type: 'square' } })
    maze.generate('dfs').finish()

    expect(() => maze.solve('bfs', { end: { x: 4, y: 0 }, start: { x: 0, y: 0 } }))
      .toThrowError(RangeError)
    expect(() => maze.generate('dfs', { start: { x: -1, y: 0 } }))
      .toThrowError(RangeError)
  })

  it('reuses the same instance for generate then solve', () => {
    const maze = new Mazely({
      grid: { cols: 6, rows: 6, type: 'square' },
      seed: 9,
    })

    maze.generate('prim', { start: { x: 0, y: 0 } }).finish()
    expect(maze.getState().phase).toBe('generate')

    const solvePlayer = maze.solve('a-star', { end: { x: 5, y: 5 }, start: { x: 0, y: 0 } })
    expect(maze.getState().phase).toBe('solve')

    expect(solvePlayer.next()).toBe(true)
    solvePlayer.finish()
    expect(maze.getSolveResult()!.solved).toBe(true)
  })

  it('generates a spanning tree inside a masked grid for all algorithms', () => {
    // Plus-shaped mask: 9 connected cells inside a 5x5 bounding box.
    const T = true
    const F = false
    const mask = [
      [F, F, T, F, F],
      [F, F, T, F, F],
      [T, T, T, T, T],
      [F, F, T, F, F],
      [F, F, T, F, F],
    ]

    const algorithms = [
      'aldous-broder',
      'binary-tree',
      'dfs',
      'eller',
      'growing-tree',
      'hunt-and-kill',
      'kruskal',
      'prim',
      'recursive-division',
      'sidewinder',
      'traversal',
      'wilson',
    ] as const

    for (const algorithm of algorithms) {
      const maze = new Mazely({
        grid: { cols: 5, mask, rows: 5, type: 'square' },
        seed: 'mask',
      })

      expect(maze.grid.cells.length).toBe(9)
      expect(maze.grid.getCell('0:0')).toBeUndefined()

      maze.generate(algorithm, { start: { x: 2, y: 0 } }).finish()
      // A perfect maze over 9 cells is a spanning tree with 8 open edges.
      expect(openedEdgeCount(maze.grid)).toBe(8)
    }
  })

  it('rejects generation on a disconnected mask before changing edge state', () => {
    const maze = new Mazely({
      grid: {
        cols: 3,
        mask: [
          [true, false, true],
          [false, false, false],
          [true, false, true],
        ],
        rows: 3,
        type: 'square',
      },
    })

    expect(() => maze.generate('dfs')).toThrowError(/disconnected grid/)
    expect(openedEdgeCount(maze.grid)).toBe(0)
    expect(maze.getState().phase).toBe('idle')
  })

  it('solves between mask cells and stays inside the mask', () => {
    const T = true
    const F = false
    const mask = [
      [F, F, T, F, F],
      [F, F, T, F, F],
      [T, T, T, T, T],
      [F, F, T, F, F],
      [F, F, T, F, F],
    ]
    const maze = new Mazely({
      grid: { cols: 5, mask, rows: 5, type: 'square' },
      seed: 5,
    })
    maze.generate('dfs', { start: { x: 2, y: 0 } }).finish()
    maze.solve('a-star', { end: { x: 4, y: 2 }, start: { x: 0, y: 2 } }).finish()

    const result = maze.getSolveResult()!
    expect(result.solved).toBe(true)
    for (const point of result.path) {
      expect(mask[point.y][point.x]).toBe(true)
    }
  })

  it('rejects start and end points outside the mask', () => {
    const mask = [
      [true, true],
      [true, false],
    ]
    const maze = new Mazely({ grid: { cols: 2, mask, rows: 2, type: 'square' } })

    expect(() => maze.generate('dfs', { start: { x: 1, y: 1 } }))
      .toThrowError(RangeError)
  })

  it('carve step payloads follow the expansion direction', () => {
    const maze = new Mazely({
      grid: { cols: 4, rows: 4, type: 'square' },
      seed: 3,
    })
    const player = maze.generate('prim', { start: { x: 1, y: 1 } })
    player.finish()

    const reached = new Set<string>(['1:1'])
    for (const step of player.steps) {
      if (step.type !== 'carve')
        continue
      expect(reached.has(String(step.payload!.from))).toBe(true)
      expect(reached.has(String(step.payload!.to))).toBe(false)
      reached.add(String(step.payload!.to))
    }
    expect(reached.size).toBe(16)
  })
})
