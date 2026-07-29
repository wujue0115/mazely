import type { CellId, MazeCell, MazeGrid } from './types'

export function getLinkedNeighbors<Cell extends MazeCell>(
  grid: MazeGrid<Cell>,
  cell: Cell,
): Cell[] {
  return grid.getEdges(cell)
    .filter(edge => edge.opened)
    .map(edge => edge.getOther(cell))
    .filter((neighbor): neighbor is Cell => neighbor !== null)
}

export function getReachableCellIds<Cell extends MazeCell>(
  grid: MazeGrid<Cell>,
  startCellId: CellId,
): Set<CellId> {
  const start = grid.getCell(startCellId)
  if (!start) {
    throw new RangeError(`start cell "${startCellId}" does not exist.`)
  }

  const reachable = new Set<CellId>([start.id])
  const queue: Cell[] = [start]
  for (let index = 0; index < queue.length; index += 1) {
    for (const neighbor of getLinkedNeighbors(grid, queue[index])) {
      if (reachable.has(neighbor.id)) {
        continue
      }
      reachable.add(neighbor.id)
      queue.push(neighbor)
    }
  }
  return reachable
}

export function areCellsDirectlyLinked<Cell extends MazeCell>(
  grid: MazeGrid<Cell>,
  leftCellId: CellId,
  rightCellId: CellId,
): boolean {
  const left = grid.getCell(leftCellId)
  if (!left || !grid.getCell(rightCellId)) {
    return false
  }
  return getLinkedNeighbors(grid, left).some(cell => cell.id === rightCellId)
}
