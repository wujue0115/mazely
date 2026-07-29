import type { Maze } from 'mazely'
import type { MazePoint } from './maze-types'
import { getLinkedNeighbors, pointToCellId } from 'mazely'

export type GridLineVisitor = (fromX: number, fromY: number, toX: number, toY: number) => void

export function countSquareGridLines(runtime: Maze): number {
  let count = 0
  visitSquareGridLines(runtime, () => count += 1)
  return count
}

/**
 * Visits each visible square-cell boundary exactly once. Internal open edges
 * remain in this reference grid; mask boundaries are included.
 */
export function visitSquareGridLines(runtime: Maze, visit: GridLineVisitor): void {
  for (const cell of runtime.grid.cells) {
    const left = cell.col
    const top = cell.row
    visit(left, top, left + 1, top)
    visit(left, top, left, top + 1)
    if (!cell.edges.bottom) {
      visit(left, top + 1, left + 1, top + 1)
    }
    if (!cell.edges.right) {
      visit(left + 1, top, left + 1, top + 1)
    }
  }
}

export function getOpenNeighborPoints(runtime: Maze, point: MazePoint): MazePoint[] {
  const cell = runtime.grid.getCell(pointToCellId(point))
  if (!cell)
    return []

  return getLinkedNeighbors(runtime.grid, cell)
    .map(other => ({ x: other.col, y: other.row }))
}

export function hasOpenCellEdge(runtime: Maze, x: number, y: number): boolean {
  const cell = runtime.grid.getCell(pointToCellId({ x, y }))
  return cell ? runtime.grid.getEdges(cell).some(edge => edge.opened) : false
}

export function getAllNeighborPoints(runtime: Maze, point: MazePoint): MazePoint[] {
  const cell = runtime.grid.getCell(pointToCellId(point))
  if (!cell)
    return []

  return runtime.grid
    .getNeighbors(cell)
    .map(other => ({ x: other.col, y: other.row }))
}
