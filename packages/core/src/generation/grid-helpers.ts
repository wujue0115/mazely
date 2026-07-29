import type { MazeEdge, SquareCell } from '../types'

export function edgeBetween(a: SquareCell, b: SquareCell): MazeEdge | undefined {
  return a.getEdges().find(edge => edge.getOther(a)?.id === b.id)
}

export function cardinalNeighbors(cell: SquareCell): SquareCell[] {
  return cell.getNeighbors() as SquareCell[]
}

export function unvisitedNeighbors(cell: SquareCell, visited: Set<string>): SquareCell[] {
  return cardinalNeighbors(cell).filter(neighbor => !visited.has(neighbor.id))
}

export function cellAt(cellsByPosition: Map<string, SquareCell>, row: number, col: number): SquareCell | undefined {
  return cellsByPosition.get(`${row}:${col}`)
}

export function buildPositionMap(cells: SquareCell[]): Map<string, SquareCell> {
  return new Map(cells.map(cell => [`${cell.row}:${cell.col}`, cell]))
}
