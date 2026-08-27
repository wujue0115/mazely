import type { GridCell, MazeEdge } from '../types'

export function edgeBetween(a: GridCell, b: GridCell): MazeEdge | undefined {
  return a.getEdges().find(edge => edge.getOther(a)?.id === b.id)
}

export function neighbors(cell: GridCell): GridCell[] {
  return cell.getNeighbors() as GridCell[]
}

export function unvisitedNeighbors(cell: GridCell, visited: Set<string>): GridCell[] {
  return neighbors(cell).filter(neighbor => !visited.has(neighbor.id))
}

export function cellAt(cellsByPosition: Map<string, GridCell>, row: number, col: number): GridCell | undefined {
  return cellsByPosition.get(`${row}:${col}`)
}

export function buildPositionMap(cells: GridCell[]): Map<string, GridCell> {
  return new Map(cells.map(cell => [`${cell.row}:${cell.col}`, cell]))
}
