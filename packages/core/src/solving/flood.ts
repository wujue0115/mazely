import type {
  CellId,
  MazeAlgorithm,
  MazeContext,
  MazePoint,
  MazeSolvingStep,
  SquareCell,
} from '../types'
import { pointToCellId } from '../types'
import { getOpenNeighbors } from './shared'

interface FloodQueueEntry {
  cell: SquareCell
  depth: number
  parentId: CellId | null
}

class SolveFloodAlgorithm implements MazeAlgorithm<SquareCell, MazeSolvingStep> {
  name = 'solve-flood'

  constructor(private readonly start: MazePoint) {}

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeSolvingStep> {
    const startCell = context.grid.getCell(pointToCellId(this.start))
    if (!startCell) {
      return
    }

    const visited = new Set<CellId>([startCell.id])
    const queue: FloodQueueEntry[] = [{
      cell: startCell,
      depth: 0,
      parentId: null,
    }]

    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index]
      yield {
        patches: [
          {
            cellId: current.cell.id,
            from: undefined,
            key: 'solve.visited',
            to: true,
            type: 'setCellMeta',
          },
          ...(current.parentId
            ? [{
                cellId: current.cell.id,
                from: undefined,
                key: 'solve.parentId',
                to: current.parentId,
                type: 'setCellMeta' as const,
              }]
            : []),
        ],
        payload: {
          depth: current.depth,
          from: current.parentId,
          to: current.cell.id,
        },
        type: 'solve.flood',
      }

      for (const next of getOpenNeighbors(context, current.cell)) {
        if (visited.has(next.id)) {
          continue
        }
        visited.add(next.id)
        queue.push({
          cell: next,
          depth: current.depth + 1,
          parentId: current.cell.id,
        })
      }
    }
  }
}

export function createSolveFloodAlgorithm(
  start: MazePoint,
): MazeAlgorithm<SquareCell, MazeSolvingStep> {
  return new SolveFloodAlgorithm(start)
}
