import type { MazeAlgorithm, MazeContext, MazePoint, MazeSolvingStep, SquareCell } from '../types'
import { buildProcessStep, buildVisitStartStep, getOpenNeighbors, getSolveStartAndEndCells } from './shared'

class SolveBfsAlgorithm implements MazeAlgorithm<SquareCell, MazeSolvingStep> {
  name = 'solve-bfs'

  constructor(private readonly start: MazePoint, private readonly end: MazePoint) {}

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeSolvingStep> {
    const { startCell, endCell } = getSolveStartAndEndCells(context, this.start, this.end)
    if (!startCell || !endCell)
      return

    const visited = new Set<string>([startCell.id])
    const queue: SquareCell[] = [startCell]
    let head = 0
    yield buildVisitStartStep(startCell)

    while (head < queue.length) {
      const current = queue[head]
      head += 1
      if (current.id === endCell.id) {
        yield buildProcessStep(current, [])
        break
      }

      const added: SquareCell[] = []
      for (const next of getOpenNeighbors(context, current)) {
        if (visited.has(next.id))
          continue
        visited.add(next.id)
        queue.push(next)
        added.push(next)
      }
      yield buildProcessStep(current, added.map(cell => ({ cell })))
    }
  }
}

export function createSolveBfsAlgorithm(
  start: MazePoint,
  end: MazePoint,
): MazeAlgorithm<SquareCell, MazeSolvingStep> {
  return new SolveBfsAlgorithm(start, end)
}
