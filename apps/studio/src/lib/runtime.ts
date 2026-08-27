import type { Maze } from 'mazely'
import type { MazePoint } from './maze-types'
import { getLinkedNeighbors, pointToCellId } from 'mazely'
import { getCellCenter, visitGridLines } from './grid-geometry'

export type GridLineVisitor = (fromX: number, fromY: number, toX: number, toY: number) => void

export function countGridLines(runtime: Maze): number {
  let count = 0
  visitReferenceGridLines(runtime, () => count += 1)
  return count
}

/**
 * Visits each visible cell boundary exactly once. Internal open edges remain
 * in this reference grid; mask boundaries are included.
 */
export function visitReferenceGridLines(runtime: Maze, visit: GridLineVisitor): void {
  visitGridLines(runtime, segment =>
    visit(segment.from.x, segment.from.y, segment.to.x, segment.to.y))
}

export function getOpenNeighborPoints(runtime: Maze, point: MazePoint): MazePoint[] {
  const cell = runtime.grid.getCell(pointToCellId(point))
  if (!cell)
    return []

  return getLinkedNeighbors(runtime.grid, cell)
    .map(other => ({ x: other.col, y: other.row }))
}

export function getCellWorldCenter(runtime: Maze, point: MazePoint) {
  const cell = runtime.grid.getCell(pointToCellId(point))
  return cell ? getCellCenter(cell) : null
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
