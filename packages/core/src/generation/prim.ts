import type { CellId, MazeAlgorithm, MazeContext, MazeEdge, MazeGenerationStep, MazePoint, SquareCell } from '../types'
import { PriorityQueue } from '../utils'
import { buildCarveStep, resolveStartCell } from './shared'

interface WeightedFrontierEdge {
  edge: MazeEdge
  from: SquareCell
  to: SquareCell
  weight: number
}

/**
 * Prim's algorithm on a randomly weighted grid: every frontier edge gets a
 * random weight when it is discovered, and the minimum-weight edge is always
 * carved next. Unlike a uniform random frontier pick (see `traversal`), the
 * weights are fixed at discovery time.
 */
class PrimSquareAlgorithm implements MazeAlgorithm<SquareCell, MazeGenerationStep> {
  name = 'prim'

  constructor(private readonly start?: MazePoint) {}

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeGenerationStep> {
    const first = resolveStartCell(context, this.start)
    if (!first) {
      return
    }

    const visited = new Set<CellId>([first.id])
    const frontier = new PriorityQueue<WeightedFrontierEdge>((a, b) => a.weight < b.weight)

    const pushFrontierEdges = (cell: SquareCell): void => {
      for (const edge of context.grid.getEdges(cell)) {
        const other = edge.getOther(cell) as SquareCell | null
        if (!other || visited.has(other.id)) {
          continue
        }
        frontier.push({ edge, from: cell, to: other, weight: context.random.next() })
      }
    }

    pushFrontierEdges(first)

    while (!frontier.isEmpty()) {
      const picked = frontier.pop()!
      if (visited.has(picked.to.id)) {
        continue
      }

      visited.add(picked.to.id)
      yield buildCarveStep(picked.edge, picked.from, picked.to)
      pushFrontierEdges(picked.to)
    }
  }
}

export function createPrimAlgorithm(start?: MazePoint): MazeAlgorithm<SquareCell, MazeGenerationStep> {
  return new PrimSquareAlgorithm(start)
}
