import type { MazeGrid, MazePoint, MazeSolvingAlgorithm, SolveMazeResult, SquareCell } from '../types'
import { pointToCellId } from '../types'

export function readSolveResult(options: {
  grid: MazeGrid<SquareCell>
  end: MazePoint
  algorithm: MazeSolvingAlgorithm
}): SolveMazeResult {
  const endCell = options.grid.getCell(pointToCellId(options.end))
  const solved = Boolean(endCell?.getMeta('solve.visited'))
  const path = solved && endCell ? reconstructPath(options.grid, endCell) : []
  const visitedCount = options.grid.cells.filter(cell => Boolean(cell.getMeta('solve.visited'))).length

  return {
    algorithm: options.algorithm,
    path,
    solved,
    visitedCount,
  }
}

function reconstructPath(grid: MazeGrid<SquareCell>, end: SquareCell): MazePoint[] {
  const out: MazePoint[] = []
  const seen = new Set<string>()
  let current: SquareCell | undefined = end

  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    out.push({ x: current.col, y: current.row })
    const parentId = current.getMeta<string>('solve.parentId')
    if (!parentId)
      break
    current = grid.getCell(parentId)
  }

  out.reverse()
  return out
}
