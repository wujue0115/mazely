import type { CellId, MazeAlgorithm, MazeContext, MazeEdge, MazeGenerationStep, MazePoint, SquareCell } from '../types'
import { resolveStartCell } from './shared'

class DfsSquareAlgorithm implements MazeAlgorithm<SquareCell, MazeGenerationStep> {
  name = 'dfs'

  constructor(private readonly start?: MazePoint) {}

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeGenerationStep> {
    const first = resolveStartCell(context, this.start)
    if (!first) {
      return
    }

    const visited = new Set<CellId>([first.id])
    const stack: SquareCell[] = [first]

    yield {
      type: 'visit',
      patches: [{ type: 'setCellMeta', cellId: first.id, key: 'visited', from: undefined, to: true }],
      payload: { to: first.id },
    }

    while (stack.length > 0) {
      const current = stack[stack.length - 1]
      const candidates: Array<{ edge: MazeEdge, neighbor: SquareCell }> = []
      for (const edge of context.grid.getEdges(current)) {
        const neighbor = edge.getOther(current) as SquareCell | null
        if (neighbor && !visited.has(neighbor.id)) {
          candidates.push({ edge, neighbor })
        }
      }

      if (candidates.length === 0) {
        stack.pop()
        continue
      }

      const pick = context.random.pick(candidates)
      const next = pick.neighbor
      visited.add(next.id)
      stack.push(next)

      yield {
        type: 'carve',
        patches: [
          { type: 'setEdgeOpened', edgeId: pick.edge.id, from: pick.edge.opened, to: true },
          { type: 'setCellMeta', cellId: next.id, key: 'visited', from: undefined, to: true },
        ],
        payload: { from: current.id, to: next.id },
      }
    }
  }
}

export function createDfsAlgorithm(start?: MazePoint): MazeAlgorithm<SquareCell, MazeGenerationStep> {
  return new DfsSquareAlgorithm(start)
}
