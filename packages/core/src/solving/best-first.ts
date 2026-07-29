import type { MazeAlgorithm, MazeContext, MazePoint, MazeSolvingStep, SquareCell } from '../types'
import { PriorityQueue } from '../utils'
import { buildExpandStep, buildVisitStartStep, getOpenNeighbors, getSolveStartAndEndCells } from './shared'

interface FrontierNode {
  cell: SquareCell
  score: number
}

class SolveBestFirstAlgorithm implements MazeAlgorithm<SquareCell, MazeSolvingStep> {
  name = 'solve-best-first'

  constructor(private readonly start: MazePoint, private readonly end: MazePoint) {}

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeSolvingStep> {
    const { startCell, endCell } = getSolveStartAndEndCells(context, this.start, this.end)
    if (!startCell || !endCell)
      return

    const heuristic = (cell: SquareCell) =>
      Math.abs(cell.col - endCell.col) + Math.abs(cell.row - endCell.row)

    const visited = new Set<string>([startCell.id])
    const frontier = new PriorityQueue<FrontierNode>((a, b) => a.score < b.score)
    frontier.push({ cell: startCell, score: heuristic(startCell) })
    yield buildVisitStartStep(startCell)

    while (!frontier.isEmpty()) {
      const current = frontier.pop()!.cell
      if (current.id === endCell.id)
        break

      for (const next of getOpenNeighbors(context, current)) {
        if (visited.has(next.id))
          continue
        visited.add(next.id)
        frontier.push({ cell: next, score: heuristic(next) })
        yield buildExpandStep(current, next)
      }
    }
  }
}

export function createSolveBestFirstAlgorithm(
  start: MazePoint,
  end: MazePoint,
): MazeAlgorithm<SquareCell, MazeSolvingStep> {
  return new SolveBestFirstAlgorithm(start, end)
}
