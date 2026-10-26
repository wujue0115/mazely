import type { CellId, GridCell, MazeEdge, MazeGrid } from '../types'
import { CircularCell, MazeEdge as Edge, pointToCellId } from '../types'

export interface CircularGrid extends MazeGrid<GridCell> {
  readonly type: 'circular'
  readonly rings: number
  /** Number of sectors in each ring, from the center outward. */
  readonly ringCellCounts: readonly number[]
  readonly cells: CircularCell[]
  getCell: (id: CellId) => CircularCell | undefined
  getNeighbors: (cell: GridCell) => CircularCell[]
}

class CircularGridImpl implements CircularGrid {
  readonly type = 'circular' as const
  readonly rows: number
  /** Largest sector count; retained for generic viewport and state consumers. */
  readonly cols: number
  readonly rings: number
  readonly ringCellCounts: readonly number[]
  readonly cells: CircularCell[] = []
  readonly edges: MazeEdge[] = []
  private readonly cellsById = new Map<CellId, CircularCell>()
  private readonly cellsByRing: (CircularCell | undefined)[][] = []

  constructor(rings: number, mask?: readonly (readonly boolean[])[]) {
    this.rings = rings
    this.rows = rings
    this.ringCellCounts = buildRingCellCounts(rings)
    this.cols = Math.max(...this.ringCellCounts)

    for (let ring = 0; ring < rings; ring += 1) {
      const cells: (CircularCell | undefined)[] = []
      const count = this.ringCellCounts[ring]
      for (let sector = 0; sector < count; sector += 1) {
        if (mask && !mask[ring]?.[sector]) {
          cells.push(undefined)
          continue
        }
        const cell = new CircularCell({
          col: sector,
          id: pointToCellId({ x: sector, y: ring }),
          innerRadius: ring,
          outerRadius: ring + 1,
          ring,
          row: ring,
          sectorCount: count,
        })
        cell.worldX = rings
        cell.worldY = rings
        cells.push(cell)
        this.cells.push(cell)
        this.cellsById.set(cell.id, cell)
      }
      this.cellsByRing.push(cells)
    }

    for (const ringCells of this.cellsByRing) {
      if (ringCells.length < 2)
        continue
      for (let sector = 0; sector < ringCells.length; sector += 1) {
        const from = ringCells[sector]
        const to = ringCells[(sector + 1) % ringCells.length]
        if (!from || !to)
          continue
        const edge = this.createEdge(from, to)
        from.clockwise = edge
        to.counterclockwise = edge
      }
    }
    for (let ring = 1; ring < rings; ring += 1) {
      const inner = this.cellsByRing[ring - 1]
      const outer = this.cellsByRing[ring]
      for (const outerCell of outer) {
        if (!outerCell)
          continue
        const innerSector = Math.floor(outerCell.col * inner.length / outer.length)
        const innerCell = inner[innerSector]
        if (!innerCell)
          continue
        const edge = this.createEdge(innerCell, outerCell)
        outerCell.inward = edge
        innerCell.outward.push(edge)
      }
    }
  }

  getCell(id: CellId): CircularCell | undefined { return this.cellsById.get(id) }
  getNeighbors(cell: GridCell): CircularCell[] { return cell.getNeighbors() as CircularCell[] }
  getEdges(cell: GridCell): MazeEdge[] { return cell.getEdges() }

  private createEdge(from: CircularCell, to: CircularCell): MazeEdge {
    const edge = new Edge({ id: `${from.id}->${to.id}`, from, to })
    this.edges.push(edge)
    return edge
  }
}

/**
 * Builds a balanced polar layout. The first annulus starts with six sectors;
 * later rings only split when an arc would become visibly wider than its
 * radial depth. This keeps the center open and avoids a noisy pinwheel.
 */
export function buildRingCellCounts(rings: number): number[] {
  const counts = [1]
  for (let ring = 1; ring < rings; ring += 1) {
    let count = ring === 1 ? 6 : counts[ring - 1]
    if (ring > 1) {
      while ((Math.PI * 2 * (ring + 0.5)) / count > 1.5) count *= 2
    }
    counts.push(count)
  }
  return counts
}

export function createCircularGrid(rings: number, mask?: readonly (readonly boolean[])[]): CircularGrid {
  if (!Number.isInteger(rings) || rings <= 0) {
    throw new TypeError(`rings must be a positive integer, received rings=${rings}`)
  }
  const grid = new CircularGridImpl(rings, mask)
  if (grid.cells.length === 0) {
    throw new TypeError('mask excludes every cell; at least one cell must remain')
  }
  return grid
}
