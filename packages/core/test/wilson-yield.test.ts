import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createCircularGrid, createRandom, getReachableCellIds, StepPlayer } from '../src'
import { createWilsonAlgorithm } from '../src/generation/wilson'

function generation(seed: number) {
  const grid = createCircularGrid(8)
  const player = new StepPlayer({ grid, steps: createWilsonAlgorithm().generate({ grid, random: createRandom(seed) }) })
  return { grid, player }
}

describe('cooperative Wilson generation', () => {
  it.each([
    [0, 'f6a61072e1caf37a6860ee24f5d667374ab6ef3db65c52e2bb02a88020b51be7'],
    [1, 'f7a037406b1752c441d874a8babe780edefa5a35943f05907f415d6492f387db'],
    [42, '0d178bd523b84c804b3defa822c7cc0784bed3be178f0bdd0f62661adbc7496e'],
  ] as const)('preserves the legacy seeded maze for seed %i', (seed, expected) => {
    const { grid, player } = generation(seed)
    player.finish()
    const edges = grid.edges.filter(edge => edge.opened).map(edge => edge.id).sort()
    expect(createHash('sha256').update(edges.join('|')).digest('hex')).toBe(expected)
    expect(edges).toHaveLength(grid.cells.length - 1)
    expect(getReachableCellIds(grid, '0:0').size).toBe(grid.cells.length)
    expect(player.steps.some(step => step.type === 'generation.yield')).toBe(true)
  })

  it('bounds random-walk work between yields without carving exploratory edges', () => {
    const grid = createCircularGrid(40)
    const random = createRandom(1)
    let calls = 0
    const instrumented = {
      ...random,
      pick: <T>(values: T[]) => {
        calls += 1
        return random.pick(values)
      },
      int: (min: number, max: number) => {
        calls += 1
        return random.int(min, max)
      },
    }
    const iterator = createWilsonAlgorithm().generate({ grid, random: instrumented })
    let checkpoints = 0
    while (true) {
      const before = calls
      const result = iterator.next()
      expect(calls - before).toBeLessThanOrEqual(258)
      if (result.done || result.value.type === 'carve')
        break
      expect(result.value).toEqual({ type: 'generation.yield', patches: [] })
      expect(grid.edges.some(edge => edge.opened)).toBe(false)
      checkpoints += 1
    }
    expect(checkpoints).toBeGreaterThan(1)
  })

  it('rewinds and replays checkpoints without changing the maze', () => {
    const { grid, player } = generation(42)
    player.finish()
    const opened = () => grid.edges.filter(edge => edge.opened).map(edge => edge.id)
    const completed = opened()
    player.reset()
    expect(opened()).toEqual([])
    player.finish()
    expect(opened()).toEqual(completed)
  })
})
