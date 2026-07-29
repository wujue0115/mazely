import type { CellId, MazeAlgorithm, MazeContext, MazeGenerationStep, SquareCell } from '../types'
import { edgeBetween } from './grid-helpers'
import { buildCarveStep } from './shared'

class WilsonSquareAlgorithm implements MazeAlgorithm<SquareCell, MazeGenerationStep> {
  name = 'wilson';

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeGenerationStep> {
    const unvisited = new Map<CellId, SquareCell>(context.grid.cells.map(cell => [cell.id, cell]))
    if (unvisited.size === 0) {
      return
    }

    const first = context.random.pick(context.grid.cells)
    unvisited.delete(first.id)

    while (unvisited.size > 0) {
      let current = context.random.pick([...unvisited.values()])
      const path: SquareCell[] = [current]
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
          }
        }
        else {
          path.push(next)
          pathIndex.set(next.id, path.length - 1)
        }
        current = next
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
        yield buildCarveStep(edge, from, to)
      }
    }
  }
}

export function createWilsonAlgorithm(): MazeAlgorithm<SquareCell, MazeGenerationStep> {
  return new WilsonSquareAlgorithm()
}
