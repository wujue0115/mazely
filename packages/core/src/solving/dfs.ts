import type { GridCell, MazeAlgorithm, MazeContext, MazePoint, MazeSolvingStep } from '../types'
import { buildExpandStep, buildVisitStartStep, getOpenNeighbors, getSolveStartAndEndCells } from './shared'

class SolveDfsAlgorithm implements MazeAlgorithm<GridCell, MazeSolvingStep> {
  name = 'solve-dfs'

  constructor(private readonly start: MazePoint, private readonly end: MazePoint) {}

  * generate(context: MazeContext<GridCell>): IterableIterator<MazeSolvingStep> {
    const { startCell, endCell } = getSolveStartAndEndCells(context, this.start, this.end)
    if (!startCell || !endCell)
      return

    const visited = new Set<string>([startCell.id])
    const stack: GridCell[] = [startCell]
    yield buildVisitStartStep(startCell)

    while (stack.length > 0) {
      const current = stack[stack.length - 1]
      if (current.id === endCell.id)
        break

      const next = getOpenNeighbors(context, current).find(cell => !visited.has(cell.id))
      if (!next) {
        stack.pop()
        continue
      }

      visited.add(next.id)
      stack.push(next)
      yield buildExpandStep(current, next)
    }
  }
}

export function createSolveDfsAlgorithm(
  start: MazePoint,
  end: MazePoint,
): MazeAlgorithm<GridCell, MazeSolvingStep> {
  return new SolveDfsAlgorithm(start, end)
}
