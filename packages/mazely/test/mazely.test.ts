import { describe, expect, it } from 'vitest'
import { createMaze, DEFAULT_MAZE_SIZE, MAZELY_DEFAULTS, serializeGrid } from '../src'

describe('mazely facade', () => {
  it('creates a maze with friendly defaults', () => {
    const maze = createMaze()

    expect(maze.grid.rows).toBe(DEFAULT_MAZE_SIZE.rows)
    expect(maze.grid.cols).toBe(DEFAULT_MAZE_SIZE.cols)
  })

  it('generates and solves end to end with default algorithms', () => {
    const maze = createMaze({ grid: { cols: 9, rows: 9, type: 'square' }, seed: 42 })

    maze.generate(MAZELY_DEFAULTS.generationAlgorithm).finish()
    maze.solve(MAZELY_DEFAULTS.solvingAlgorithm, {
      end: { x: 8, y: 8 },
      start: { x: 0, y: 0 },
    }).finish()

    const result = maze.getSolveResult()!
    expect(result.solved).toBe(true)
    expect(result.path.at(-1)).toEqual({ x: 8, y: 8 })
  })

  it('re-exports the core API', () => {
    const maze = createMaze({ grid: { cols: 4, rows: 4, type: 'square' }, seed: 1 })
    maze.generate('kruskal').finish()

    const serialized = serializeGrid(maze.grid)
    expect(serialized.openedEdgeIds.length).toBe(15)
  })
})
