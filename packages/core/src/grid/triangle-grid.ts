import type { CellId, GridCell, MazeGrid, TriangleGridLayout } from '../types'
import { MazeEdge, pointToCellId, TriangleCell } from '../types'

export interface TriangleGrid extends MazeGrid<GridCell> {
  readonly type: 'triangle'
  readonly layout: TriangleGridLayout
  readonly size?: number
  readonly cells: TriangleCell[]
  getCell: (id: CellId) => TriangleCell | undefined
  getNeighbors: (cell: GridCell) => TriangleCell[]
}

class TriangleGridImpl implements TriangleGrid {
  readonly type = 'triangle' as const
  readonly rows: number
  readonly cols: number
  readonly layout: TriangleGridLayout
  readonly size?: number
  readonly cells: TriangleCell[] = []
  readonly edges: MazeEdge[] = []

  private readonly cellsById = new Map<CellId, TriangleCell>()

  constructor(options: TriangleGridShape, mask?: TriangleGridMask) {
    this.layout = options.layout
    this.size = options.layout === 'triangle' ? options.size : undefined
    this.rows = options.layout === 'triangle' ? options.size : options.rows
    this.cols = options.layout === 'triangle' ? options.size * 2 - 1 : options.cols

    const matrix: (TriangleCell | null)[][] = []
    for (let row = 0; row < this.rows; row += 1) {
      const line: (TriangleCell | null)[] = []
      const rowCellCount = this.layout === 'triangle' ? row * 2 + 1 : this.cols
      for (let col = 0; col < rowCellCount; col += 1) {
        if (mask && !mask[row]?.[col]) {
          line.push(null)
          continue
        }
        const cell = new TriangleCell({
          col,
          id: pointToCellId({ x: col, y: row }),
          offsetX: this.layout === 'triangle' ? ((this.size! - row - 1) / 2) : 0,
          orientation: (this.layout === 'triangle' ? col : row + col) % 2 === 0 ? 'up' : 'down',
          row,
        })
        line.push(cell)
        this.cells.push(cell)
        this.cellsById.set(cell.id, cell)
      }
      matrix.push(line)
    }

    for (let row = 0; row < this.rows; row += 1) {
      const rowCellCount = this.layout === 'triangle' ? row * 2 + 1 : this.cols
      for (let col = 0; col < rowCellCount; col += 1) {
        const cell = matrix[row][col]
        if (!cell) {
          continue
        }

        const right = col < rowCellCount - 1 ? matrix[row][col + 1] : null
        if (right) {
          const edge = createEdge(cell, right)
          cell.edges.right = edge
          right.edges.left = edge
          this.edges.push(edge)
        }

        if (cell.orientation === 'up') {
          const bottomCol = this.layout === 'triangle' ? col + 1 : col
          const bottom = row < this.rows - 1 ? matrix[row + 1][bottomCol] : null
          if (bottom) {
            const edge = createEdge(cell, bottom)
            cell.edges.bottom = edge
            bottom.edges.top = edge
            this.edges.push(edge)
          }
        }
      }
    }
  }

  getCell(id: CellId): TriangleCell | undefined {
    return this.cellsById.get(id)
  }

  getNeighbors(cell: GridCell): TriangleCell[] {
    return cell.getNeighbors() as TriangleCell[]
  }

  getEdges(cell: GridCell): MazeEdge[] {
    return cell.getEdges()
  }
}

function createEdge(from: TriangleCell, to: TriangleCell): MazeEdge {
  return new MazeEdge({ id: `${from.id}->${to.id}`, from, to })
}

/** Cell inclusion mask indexed as `mask[row][col]`; `true` keeps the cell. */
export type TriangleGridMask = readonly (readonly boolean[])[]

type TriangleGridShape
  = | { layout: 'triangle', size: number }
    | { layout: 'rectangle', rows: number, cols: number }

export function createTriangleGrid(size: number, mask?: TriangleGridMask): TriangleGrid
export function createTriangleGrid(rows: number, cols: number, mask?: TriangleGridMask): TriangleGrid
export function createTriangleGrid(
  sizeOrRows: number,
  colsOrMask?: number | TriangleGridMask,
  rectangularMask?: TriangleGridMask,
): TriangleGrid {
  const rectangular = typeof colsOrMask === 'number'
  const shape: TriangleGridShape = rectangular
    ? { layout: 'rectangle', cols: colsOrMask, rows: sizeOrRows }
    : { layout: 'triangle', size: sizeOrRows }
  if (!Number.isInteger(sizeOrRows) || sizeOrRows <= 0
    || (rectangular && (!Number.isInteger(colsOrMask) || colsOrMask <= 0))) {
    throw new TypeError(rectangular
      ? `rows and cols must be positive integers, received rows=${sizeOrRows}, cols=${colsOrMask}`
      : `size must be a positive integer, received size=${sizeOrRows}`)
  }
  const mask = rectangular ? rectangularMask : colsOrMask
  const grid = new TriangleGridImpl(shape, mask)
  if (grid.cells.length === 0) {
    throw new TypeError('mask excludes every cell; at least one cell must remain')
  }
  return grid
}
