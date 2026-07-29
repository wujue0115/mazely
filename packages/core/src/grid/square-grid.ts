import type { CellId, MazeGrid } from '../types'
import { MazeEdge, pointToCellId, SquareCell } from '../types'

class SquareGrid implements MazeGrid<SquareCell> {
  readonly rows: number
  readonly cols: number
  readonly cells: SquareCell[]
  readonly edges: MazeEdge[]

  private readonly cellsById = new Map<CellId, SquareCell>()

  constructor(rows: number, cols: number, mask?: SquareGridMask) {
    this.rows = rows
    this.cols = cols
    this.cells = []
    this.edges = []

    const matrix: (SquareCell | null)[][] = []
    for (let row = 0; row < rows; row += 1) {
      const line: (SquareCell | null)[] = []
      for (let col = 0; col < cols; col += 1) {
        if (mask && !mask[row]?.[col]) {
          line.push(null)
          continue
        }
        const cell = new SquareCell({ id: pointToCellId({ x: col, y: row }), row, col })
        line.push(cell)
        this.cells.push(cell)
        this.cellsById.set(cell.id, cell)
      }
      matrix.push(line)
    }

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cell = matrix[row][col]
        if (!cell) {
          continue
        }
        const right = col < cols - 1 ? matrix[row][col + 1] : null
        if (right) {
          const edge = new MazeEdge({
            id: `${cell.id}->${right.id}`,
            from: cell,
            to: right,
          })
          cell.edges.right = edge
          right.edges.left = edge
          this.edges.push(edge)
        }
        const bottom = row < rows - 1 ? matrix[row + 1][col] : null
        if (bottom) {
          const edge = new MazeEdge({
            id: `${cell.id}->${bottom.id}`,
            from: cell,
            to: bottom,
          })
          cell.edges.bottom = edge
          bottom.edges.top = edge
          this.edges.push(edge)
        }
      }
    }
  }

  getCell(id: CellId): SquareCell | undefined {
    return this.cellsById.get(id)
  }

  getNeighbors(cell: SquareCell): SquareCell[] {
    return cell.getNeighbors() as SquareCell[]
  }

  getEdges(cell: SquareCell) {
    return cell.getEdges()
  }
}

/** Cell inclusion mask indexed as `mask[row][col]`; `true` keeps the cell. */
export type SquareGridMask = readonly (readonly boolean[])[]

export function createSquareGrid(rows: number, cols: number, mask?: SquareGridMask): MazeGrid<SquareCell> {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
    throw new TypeError(`rows and cols must be positive integers, received rows=${rows}, cols=${cols}`)
  }
  const grid = new SquareGrid(rows, cols, mask)
  if (grid.cells.length === 0) {
    throw new TypeError('mask excludes every cell; at least one cell must remain')
  }
  return grid
}
