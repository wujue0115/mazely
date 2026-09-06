import type { CellId, GridCell, HexDirection, HexGridLayout, HexOrientation, MazeGrid } from '../types'
import { HexCell, MazeEdge, pointToCellId } from '../types'

export interface HexGrid extends MazeGrid<GridCell> {
  readonly type: 'hexagon'
  readonly layout: HexGridLayout
  readonly hexLayout: HexGridLayout
  readonly orientation: HexOrientation
  /** Side length of a hexagonal boundary; omitted for rectangular layouts. */
  readonly size?: number
  readonly cells: HexCell[]
  getCell: (id: CellId) => HexCell | undefined
  getNeighbors: (cell: GridCell) => HexCell[]
}

/** Cell inclusion mask indexed as `mask[row][col]`; `true` keeps the cell. */
export type HexGridMask = readonly (readonly boolean[])[]

type HexGridShape
  = | { layout: 'rectangle', rows: number, cols: number }
    | { layout: 'hexagon', size: number }

const DIRECTION_OFFSETS: Record<HexDirection, { q: number, r: number }> = {
  e: { q: 1, r: 0 },
  ne: { q: 1, r: -1 },
  nw: { q: 0, r: -1 },
  se: { q: 0, r: 1 },
  sw: { q: -1, r: 1 },
  w: { q: -1, r: 0 },
}

const OPPOSITE_DIRECTION: Record<HexDirection, HexDirection> = {
  e: 'w',
  ne: 'sw',
  nw: 'se',
  se: 'nw',
  sw: 'ne',
  w: 'e',
}

const HEX_RADIUS = 1 / Math.sqrt(3)

class HexGridImpl implements HexGrid {
  readonly type = 'hexagon' as const
  readonly rows: number
  readonly cols: number
  readonly layout: HexGridLayout
  readonly hexLayout: HexGridLayout
  readonly orientation: HexOrientation
  readonly size?: number
  readonly cells: HexCell[] = []
  readonly edges: MazeEdge[] = []

  private readonly cellsById = new Map<CellId, HexCell>()

  constructor(shape: HexGridShape, orientation: HexOrientation, mask?: HexGridMask) {
    this.layout = shape.layout
    this.hexLayout = shape.layout
    this.orientation = orientation
    this.size = shape.layout === 'hexagon' ? shape.size : undefined
    this.rows = shape.layout === 'hexagon' ? shape.size * 2 - 1 : shape.rows
    this.cols = shape.layout === 'hexagon' ? shape.size * 2 - 1 : shape.cols

    const cellsByAxial = new Map<string, HexCell>()
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const axial = this.toAxial(col, row)
        if (!this.isInLayout(axial.q, axial.r) || (mask && !mask[row]?.[col])) {
          continue
        }
        const cell = new HexCell({
          col,
          id: pointToCellId({ x: col, y: row }),
          orientation: this.orientation,
          q: axial.q,
          r: axial.r,
          row,
        })
        this.cells.push(cell)
        this.cellsById.set(cell.id, cell)
        cellsByAxial.set(axialKey(axial.q, axial.r), cell)
      }
    }

    for (const cell of this.cells) {
      for (const direction of Object.keys(DIRECTION_OFFSETS) as HexDirection[]) {
        if (cell.hexEdges[direction]) {
          continue
        }
        const offset = DIRECTION_OFFSETS[direction]
        const neighbor = cellsByAxial.get(axialKey(cell.q + offset.q, cell.r + offset.r))
        if (!neighbor) {
          continue
        }
        const edge = new MazeEdge({ id: `${cell.id}->${neighbor.id}`, from: cell, to: neighbor })
        cell.hexEdges[direction] = edge
        neighbor.hexEdges[OPPOSITE_DIRECTION[direction]] = edge
        this.edges.push(edge)
      }
    }

    this.assignWorldPositions()
  }

  getCell(id: CellId): HexCell | undefined {
    return this.cellsById.get(id)
  }

  getNeighbors(cell: GridCell): HexCell[] {
    return cell.getNeighbors() as HexCell[]
  }

  getEdges(cell: GridCell): MazeEdge[] {
    return cell.getEdges()
  }

  private toAxial(col: number, row: number): { q: number, r: number } {
    if (this.layout === 'hexagon') {
      const offset = this.size! - 1
      return { q: col - offset, r: row - offset }
    }
    return this.orientation === 'pointy'
      ? { q: col - Math.floor((row - (row & 1)) / 2), r: row }
      : { q: col, r: row - Math.floor((col - (col & 1)) / 2) }
  }

  private isInLayout(q: number, r: number): boolean {
    return this.layout === 'rectangle'
      || Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r)) < this.size!
  }

  private assignWorldPositions(): void {
    const centers = this.cells.map((cell) => {
      const center = this.orientation === 'pointy'
        ? {
            x: Math.sqrt(3) * HEX_RADIUS * (cell.q + cell.r / 2),
            y: HEX_RADIUS * 1.5 * cell.r,
          }
        : {
            x: HEX_RADIUS * 1.5 * cell.q,
            y: Math.sqrt(3) * HEX_RADIUS * (cell.r + cell.q / 2),
          }
      return { cell, ...center }
    })
    const extent = this.orientation === 'pointy'
      ? { x: Math.sqrt(3) * HEX_RADIUS / 2, y: HEX_RADIUS }
      : { x: HEX_RADIUS, y: Math.sqrt(3) * HEX_RADIUS / 2 }
    const minX = Math.min(...centers.map(center => center.x - extent.x))
    const minY = Math.min(...centers.map(center => center.y - extent.y))
    for (const center of centers) {
      center.cell.worldX = center.x - minX
      center.cell.worldY = center.y - minY
    }
  }
}

export function createHexGrid(rows: number, cols: number, options?: {
  orientation?: HexOrientation
  mask?: HexGridMask
}): HexGrid
export function createHexGrid(size: number, options?: {
  layout: 'hexagon'
  orientation?: HexOrientation
  mask?: HexGridMask
}): HexGrid
export function createHexGrid(
  sizeOrRows: number,
  colsOrOptions?: number | { layout: 'hexagon', orientation?: HexOrientation, mask?: HexGridMask } | {
    orientation?: HexOrientation
    mask?: HexGridMask
  },
  rectangularOptions?: { orientation?: HexOrientation, mask?: HexGridMask },
): HexGrid {
  const rectangular = typeof colsOrOptions === 'number'
  const options = rectangular ? rectangularOptions : colsOrOptions
  const shape: HexGridShape = rectangular
    ? { cols: colsOrOptions, layout: 'rectangle', rows: sizeOrRows }
    : { layout: 'hexagon', size: sizeOrRows }
  if (!Number.isInteger(sizeOrRows) || sizeOrRows <= 0
    || (rectangular && (!Number.isInteger(colsOrOptions) || colsOrOptions <= 0))) {
    throw new TypeError(rectangular
      ? `rows and cols must be positive integers, received rows=${sizeOrRows}, cols=${colsOrOptions}`
      : `size must be a positive integer, received size=${sizeOrRows}`)
  }
  const grid = new HexGridImpl(shape, options?.orientation ?? 'pointy', options?.mask)
  if (grid.cells.length === 0) {
    throw new TypeError('mask excludes every cell; at least one cell must remain')
  }
  return grid
}

function axialKey(q: number, r: number): string {
  return `${q}:${r}`
}
