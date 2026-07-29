import type { CellId, MazeAlgorithm, MazeContext, MazeGenerationStep, MazePoint, SquareCell } from '../types'
import { edgeBetween, unvisitedNeighbors } from './grid-helpers'
import { buildCarveStep, resolveStartCell } from './shared'

class HuntAndKillSquareAlgorithm implements MazeAlgorithm<SquareCell, MazeGenerationStep> {
  name = 'hunt-and-kill'

  constructor(private readonly start?: MazePoint) {}

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeGenerationStep> {
    let current = resolveStartCell(context, this.start)
    if (!current) {
      return
    }

    const visited = new Set<CellId>([current.id])

    while (visited.size < context.grid.cells.length) {
      const neighbors = unvisitedNeighbors(current, visited)
      if (neighbors.length > 0) {
        const next = context.random.pick(neighbors)
        const edge = edgeBetween(current, next)
        if (!edge) {
          return
        }
        visited.add(next.id)
        yield buildCarveStep(edge, current, next)
        current = next
        continue
      }

      let hunted: SquareCell | undefined
      for (let row = 0; row < context.grid.rows; row += 1) {
        yield {
          patches: [],
          payload: { row },
          type: 'hunt-scan',
        }
        hunted = context.grid.cells.find((cell) => {
          if (cell.row !== row || visited.has(cell.id)) {
            return false
          }
          return context.grid.getNeighbors(cell).some(neighbor => visited.has(neighbor.id))
        })
        if (hunted) {
          break
        }
      }
      if (!hunted) {
        return
      }

      const visitedNeighbors = context.grid.getNeighbors(hunted).filter(neighbor => visited.has(neighbor.id))
      const neighbor = context.random.pick(visitedNeighbors)
      const edge = edgeBetween(hunted, neighbor)
      if (!edge) {
        return
      }
      visited.add(hunted.id)
      yield buildCarveStep(edge, neighbor, hunted)
      current = hunted
    }
  }
}

export function createHuntAndKillAlgorithm(start?: MazePoint): MazeAlgorithm<SquareCell, MazeGenerationStep> {
  return new HuntAndKillSquareAlgorithm(start)
}
