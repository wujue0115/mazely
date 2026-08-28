import type { GridCell, MazeAlgorithm, MazeContext, MazeGenerationStep } from '../types'
import { edgeBetween } from './grid-helpers'
import { buildCarveStep } from './shared'

class BinaryTreeAlgorithm implements MazeAlgorithm<GridCell, MazeGenerationStep> {
  name = 'binary-tree';

  * generate(context: MazeContext<GridCell>): IterableIterator<MazeGenerationStep> {
    const cells = [...context.grid.cells].sort((a, b) => a.row - b.row || a.col - b.col)
    const triangleDepths = context.grid.type === 'triangle'
      ? getTriangleDepths(context, cells[0])
      : null

    for (const cell of cells) {
      const candidates = triangleDepths
        ? context.grid.getNeighbors(cell)
            .filter(neighbor => triangleDepths.get(neighbor.id) === triangleDepths.get(cell.id)! - 1)
            .slice(0, 2)
        : context.grid.getNeighbors(cell)
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
  return new BinaryTreeAlgorithm()
}

function getTriangleDepths(context: MazeContext<GridCell>, root: GridCell): Map<string, number> {
  const depths = new Map<string, number>([[root.id, 0]])
  const queue = [root]
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index]
    const depth = depths.get(cell.id)!
    for (const neighbor of context.grid.getNeighbors(cell)) {
      if (depths.has(neighbor.id)) {
        continue
      }
      depths.set(neighbor.id, depth + 1)
      queue.push(neighbor)
    }
  }
  return depths
}
