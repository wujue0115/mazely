import type { CellId, GridCell, MazeAlgorithm, MazeContext, MazeGenerationStep } from '../types'
import { edgeBetween } from './grid-helpers'
import { buildCarveStep } from './shared'

const WORK_CHUNK_SIZE = 256

class WilsonAlgorithm implements MazeAlgorithm<GridCell, MazeGenerationStep> {
  name = 'wilson';

  * generate(context: MazeContext<GridCell>): IterableIterator<MazeGenerationStep> {
    const unvisited = new Map<CellId, GridCell>()
    let work = 0
    for (const cell of context.grid.cells) {
      unvisited.set(cell.id, cell)
      if (++work >= WORK_CHUNK_SIZE) {
        work = 0
        yield { type: 'generation.yield', patches: [] }
      }
    }
    if (unvisited.size === 0) {
      return
    }

    const first = context.random.pick(context.grid.cells)
    unvisited.delete(first.id)

    while (unvisited.size > 0) {
      // Preserve Map order and the seeded random choice without allocating a
      // copy of all remaining cells for every walk.
      let target = context.random.int(0, unvisited.size - 1)
      let current = unvisited.values().next().value!
      for (const cell of unvisited.values()) {
        if (target-- === 0) {
          current = cell
          break
        }
        if (++work >= WORK_CHUNK_SIZE) {
          work = 0
          yield { type: 'generation.yield', patches: [] }
        }
      }
      const path: GridCell[] = [current]
      const pathIndex = new Map<CellId, number>([[current.id, 0]])

      while (unvisited.has(current.id)) {
        const neighbors = context.grid.getNeighbors(current)
        if (neighbors.length === 0) {
          unvisited.delete(current.id)
          break
        }

        const next = context.random.pick(neighbors)
        const loopIndex = pathIndex.get(next.id)
        if (loopIndex !== undefined) {
          for (let index = path.length - 1; index > loopIndex; index -= 1) {
            pathIndex.delete(path[index].id)
            path.pop()
            if (++work >= WORK_CHUNK_SIZE) {
              work = 0
              yield { type: 'generation.yield', patches: [] }
            }
          }
        }
        else {
          path.push(next)
          pathIndex.set(next.id, path.length - 1)
        }
        current = next
        if (++work >= WORK_CHUNK_SIZE) {
          work = 0
          yield { type: 'generation.yield', patches: [] }
        }
      }

      for (let index = 0; index < path.length - 1; index += 1) {
        const from = path[index]
        const to = path[index + 1]
        if (!unvisited.has(from.id)) {
          continue
        }
        const edge = edgeBetween(from, to)
        if (!edge) {
          continue
        }
        unvisited.delete(from.id)
        work = 0
        yield buildCarveStep(edge, from, to)
      }
    }
  }
}

export function createWilsonAlgorithm(): MazeAlgorithm<GridCell, MazeGenerationStep> {
  return new WilsonAlgorithm()
}
