import type { GridCell, MazeAlgorithm, MazeContext, MazeGenerationStep } from '../types'
import { edgeBetween } from './grid-helpers'
import { buildCarveStep } from './shared'

class BinaryTreeSquareAlgorithm implements MazeAlgorithm<GridCell, MazeGenerationStep> {
  name = 'binary-tree';

  * generate(context: MazeContext<GridCell>): IterableIterator<MazeGenerationStep> {
    const cells = [...context.grid.cells].sort((a, b) => a.row - b.row || a.col - b.col)

    for (const cell of cells) {
      const candidates = context.grid.getNeighbors(cell)
        .filter(neighbor => neighbor.row < cell.row || neighbor.col < cell.col)
      if (candidates.length === 0) {
        continue
      }

      const next = context.random.pick(candidates)
      const edge = edgeBetween(cell, next)
      if (edge) {
        yield buildCarveStep(edge, next, cell)
      }
    }
  }
}

export function createBinaryTreeAlgorithm(): MazeAlgorithm<GridCell, MazeGenerationStep> {
  return new BinaryTreeSquareAlgorithm()
}
