import type { GridCell, MazeAlgorithm, MazeContext, MazePoint, MazeSolvingStep } from '../types'
import { PriorityQueue } from '../utils'
import { buildProcessStep, buildVisitStartStep, estimateCellDistance, getOpenNeighbors, getSolveStartAndEndCells } from './shared'

interface FrontierNode {
  cell: GridCell
  score: number
}

class SolveBestFirstAlgorithm implements MazeAlgorithm<GridCell, MazeSolvingStep> {
  name = 'solve-best-first'

  constructor(private readonly start: MazePoint, private readonly end: MazePoint) {}

  * generate(context: MazeContext<GridCell>): IterableIterator<MazeSolvingStep> {
    const { startCell, endCell } = getSolveStartAndEndCells(context, this.start, this.end)
    if (!startCell || !endCell)
      return

    const heuristic = (cell: GridCell) => estimateCellDistance(cell, endCell)

    const visited = new Set<string>([startCell.id])
    const frontier = new PriorityQueue<FrontierNode>((a, b) => a.score < b.score)
    frontier.push({ cell: startCell, score: heuristic(startCell) })
    yield buildVisitStartStep(startCell)

    while (!frontier.isEmpty()) {
      const current = frontier.pop()!.cell
      if (current.id === endCell.id) {
        yield buildProcessStep(current, [])
        break
      }

      const added: GridCell[] = []
      for (const next of getOpenNeighbors(context, current)) {
        if (visited.has(next.id))
          continue
        visited.add(next.id)
        frontier.push({ cell: next, score: heuristic(next) })
        added.push(next)
      }
      yield buildProcessStep(current, added.map(cell => ({ cell })))
    }
  }
}

export function createSolveBestFirstAlgorithm(
  start: MazePoint,
  end: MazePoint,
): MazeAlgorithm<GridCell, MazeSolvingStep> {
  return new SolveBestFirstAlgorithm(start, end)
}
