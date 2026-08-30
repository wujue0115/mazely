import type { CellId, GridCell, MazeAlgorithm, MazeContext, MazePoint, MazeSolvingStep } from '../types'
import { PriorityQueue } from '../utils'
import { buildProcessStep, buildVisitStartStep, estimateCellDistance, getOpenNeighbors, getSolveStartAndEndCells } from './shared'

interface OpenNode {
  cell: GridCell
  g: number
  f: number
}

class SolveAStarAlgorithm implements MazeAlgorithm<GridCell, MazeSolvingStep> {
  name = 'solve-a-star'

  constructor(private readonly start: MazePoint, private readonly end: MazePoint) {}

  * generate(context: MazeContext<GridCell>): IterableIterator<MazeSolvingStep> {
    const { startCell, endCell } = getSolveStartAndEndCells(context, this.start, this.end)
    if (!startCell || !endCell)
      return

    const heuristic = (cell: GridCell) => estimateCellDistance(cell, endCell)

    const gScore = new Map<CellId, number>([[startCell.id, 0]])
    const parentById = new Map<CellId, CellId>()
    const open = new PriorityQueue<OpenNode>((a, b) => a.f < b.f)
    open.push({ cell: startCell, f: heuristic(startCell), g: 0 })
    yield buildVisitStartStep(startCell)

    while (!open.isEmpty()) {
      const node = open.pop()!
      // Stale entry: a shorter path to this cell was found after it was queued.
      if (node.g > (gScore.get(node.cell.id) ?? Number.POSITIVE_INFINITY))
        continue
      if (node.cell.id === endCell.id) {
        yield buildProcessStep(node.cell, [])
        break
      }

      const added: Parameters<typeof buildProcessStep>[1] = []
      for (const next of getOpenNeighbors(context, node.cell)) {
        const tentative = node.g + 1
        const known = gScore.get(next.id)
        if (known != null && tentative >= known)
          continue

        const prevParent = parentById.get(next.id)
        gScore.set(next.id, tentative)
        parentById.set(next.id, node.cell.id)
        open.push({ cell: next, f: tentative + heuristic(next), g: tentative })

        added.push({
          cell: next,
          options: {
            extraPatches: [
              { type: 'setCellMeta', cellId: next.id, key: 'solve.g', from: known, to: tentative },
            ],
            prevParent,
            prevVisited: known != null ? true : undefined,
          },
        })
      }
      yield buildProcessStep(node.cell, added)
    }
  }
}

export function createSolveAStarAlgorithm(
  start: MazePoint,
  end: MazePoint,
): MazeAlgorithm<GridCell, MazeSolvingStep> {
  return new SolveAStarAlgorithm(start, end)
}
