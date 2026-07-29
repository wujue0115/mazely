import type { MazeAlgorithm, MazeContext, MazeGenerationStep, SquareCell } from '../types'
import { buildPositionMap, cellAt, edgeBetween } from './grid-helpers'
import { buildCarveStep } from './shared'

class SidewinderSquareAlgorithm implements MazeAlgorithm<SquareCell, MazeGenerationStep> {
  name = 'sidewinder';

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeGenerationStep> {
    const byPosition = buildPositionMap(context.grid.cells)

    for (let row = 0; row < context.grid.rows; row += 1) {
      let run: SquareCell[] = []
      for (let col = 0; col < context.grid.cols; col += 1) {
        const cell = cellAt(byPosition, row, col)
        if (!cell) {
          run = []
          continue
        }

        run.push(cell)
        const east = cellAt(byPosition, row, col + 1)
        const north = cellAt(byPosition, row - 1, col)
        const mustCloseRun = !east
        const shouldCloseRun = mustCloseRun || (north && context.random.int(0, 1) === 0)

        if (shouldCloseRun) {
          const northCandidates = run.filter(runCell => cellAt(byPosition, runCell.row - 1, runCell.col))
          if (northCandidates.length > 0) {
            const linkFrom = context.random.pick(northCandidates)
            const linkTo = cellAt(byPosition, linkFrom.row - 1, linkFrom.col)!
            const edge = edgeBetween(linkFrom, linkTo)
            if (edge) {
              yield buildCarveStep(edge, linkFrom, linkTo)
            }
          }
          run = []
        }
        else if (east) {
          const edge = edgeBetween(cell, east)
          if (edge) {
            yield buildCarveStep(edge, cell, east)
          }
        }
      }
    }
  }
}

export function createSidewinderAlgorithm(): MazeAlgorithm<SquareCell, MazeGenerationStep> {
  return new SidewinderSquareAlgorithm()
}
