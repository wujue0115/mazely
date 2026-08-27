import type { CellId, GridCell, MazeAlgorithm, MazeContext, MazeGenerationStep } from '../types'
import { buildCarveStep } from './shared'

class AldousBroderAlgorithm implements MazeAlgorithm<GridCell, MazeGenerationStep> {
  name = 'aldous-broder';

  * generate(context: MazeContext<GridCell>): IterableIterator<MazeGenerationStep> {
    if (context.grid.cells.length === 0) {
      return
    }

    let current = context.random.pick(context.grid.cells)
    const visited = new Set<CellId>([current.id])

    yield {
      type: 'visit',
      patches: [],
      payload: { to: current.id },
    }

    while (visited.size < context.grid.cells.length) {
      const edges = context.grid.getEdges(current)
      if (edges.length === 0) {
        return
      }

      const edge = context.random.pick(edges)
      const next = edge.getOther(current) as GridCell | null
      if (!next) {
        continue
      }

      if (!visited.has(next.id)) {
        visited.add(next.id)
        yield buildCarveStep(edge, current, next)
      }
      else {
        yield {
          type: 'visit',
          patches: [],
          payload: { from: current.id, to: next.id },
        }
      }
      current = next
    }
  }
}

export function createAldousBroderAlgorithm(): MazeAlgorithm<GridCell, MazeGenerationStep> {
  return new AldousBroderAlgorithm()
}
