import { describe, expect, it } from 'vitest'
import { createCircularGrid, getReachableCellIds, MAZE_GENERATION_ALGORITHMS, Mazely } from '../src'

function annulusMask() {
  const full = createCircularGrid(4)
  return full.ringCellCounts.map((count, ring) => Array.from({ length: count }, () => ring > 0))
}

describe('circular masks', () => {
  it('preserves sector IDs and both sides of the seam when cells are removed', () => {
    const grid = createCircularGrid(3, [[false], [true, false, false, false, false, true], [true]])
    expect(grid.cells.map(cell => cell.id)).toEqual(['1:0', '1:5', '2:0'])
    expect(grid.getCell('1:0')?.getNeighbors().map(cell => cell.id).sort()).toEqual(['1:5', '2:0'])
    expect(grid.getCell('2:0')?.inward?.getOther(grid.getCell('2:0')!)?.id).toBe('1:0')
    expect(grid.getCell('1:0')?.inward).toBeNull()
    expect(() => createCircularGrid(3, [])).toThrow('at least one cell')
  })

  it.each(MAZE_GENERATION_ALGORITHMS)('generates and solves an annulus with %s', (algorithm) => {
    const maze = new Mazely({ grid: { rings: 4, mask: annulusMask(), type: 'circular' }, seed: `annulus-${algorithm}` })
    const player = maze.generate(algorithm)
    player.finish()
    expect(maze.grid.getCell('0:0')).toBeUndefined()
    expect(maze.grid.edges.filter(edge => edge.opened)).toHaveLength(maze.grid.cells.length - 1)
    expect(getReachableCellIds(maze.grid, '1:0').size).toBe(maze.grid.cells.length)
    maze.solve('a-star', { start: { x: 0, y: 1 }, end: { x: 0, y: 3 } }).finish()
    expect(maze.getSolveResult()?.solved).toBe(true)
  })

  it('rejects disconnected masks before modifying edges', () => {
    const maze = new Mazely({ grid: { rings: 2, mask: [[false], [true, false, false, true]], type: 'circular' } })
    expect(() => maze.generate('sidewinder')).toThrow('connected')
    expect(maze.grid.edges.every(edge => !edge.opened)).toBe(true)
  })
})
