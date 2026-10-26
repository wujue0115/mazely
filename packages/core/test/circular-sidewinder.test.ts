import { describe, expect, it } from 'vitest'
import { StepPlayer } from '../src/engine/step-player'
import { createSidewinderAlgorithm } from '../src/generation/sidewinder'
import { getReachableCellIds } from '../src/graph'
import { createCircularGrid } from '../src/grid/circular-grid'
import { serializeGrid } from '../src/grid/serialize'
import { createRandom } from '../src/utils/random'

function generate(rings: number, seed: number) {
  const grid = createCircularGrid(rings)
  const steps = createSidewinderAlgorithm().generate({ grid, random: createRandom(seed) })
  const player = new StepPlayer({ grid, steps })
  player.finish()
  return { grid, player }
}

describe('circular Sidewinder', () => {
  it.each([1, 2, 3, 5, 12])('creates a spanning tree without repair with %i rings', (rings) => {
    for (let seed = 0; seed < 12; seed += 1) {
      const { grid, player } = generate(rings, seed)
      expect(grid.edges.filter(edge => edge.opened)).toHaveLength(grid.cells.length - 1)
      expect(getReachableCellIds(grid, '0:0').size).toBe(grid.cells.length)
      expect(player.steps).toHaveLength(grid.cells.length - 1)
      // Each circular run has one inward passage, rather than a closed loop.
      for (let ring = 1; ring < rings; ring += 1) {
        const cells = grid.cells.filter(cell => cell.ring === ring)
        const clockwise = cells.filter(cell => cell.clockwise?.opened).length
        const inward = cells.filter(cell => cell.inward?.opened).length
        expect(inward).toBeGreaterThan(0)
        expect(clockwise + inward).toBe(cells.length)
      }
    }
  })

  it('replays deterministically after stepping backward and resetting', () => {
    const { grid, player } = generate(5, 42)
    const completed = serializeGrid(grid)
    player.prev(10)
    expect(grid.edges.filter(edge => edge.opened)).toHaveLength(grid.cells.length - 11)
    player.finish()
    expect(serializeGrid(grid)).toEqual(completed)
    player.reset()
    expect(grid.edges.every(edge => !edge.opened)).toBe(true)
    player.finish()
    expect(serializeGrid(grid)).toEqual(completed)
    expect(serializeGrid(generate(5, 42).grid)).toEqual(completed)
    expect(serializeGrid(generate(5, 43).grid)).not.toEqual(completed)
  })

  it('can carve across the angular seam', () => {
    const hasSeam = Array.from({ length: 12 }, (_, seed) => generate(5, seed).grid)
      .some(grid => grid.cells.some(cell => cell.sectorCount > 1 && cell.col === cell.sectorCount - 1 && cell.clockwise?.opened))
    expect(hasSeam).toBe(true)
  })
})
