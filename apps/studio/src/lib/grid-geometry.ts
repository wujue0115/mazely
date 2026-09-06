import type { GridCell, Maze, MazeEdge, MazeGridType, MazePoint, TriangleGrid } from 'mazely'
import { HexCell, TriangleCell } from 'mazely'

export interface WorldPoint {
  x: number
  y: number
}

export interface GridBounds {
  width: number
  height: number
}

export interface GridSegment {
  from: WorldPoint
  to: WorldPoint
}

export const TRIANGLE_HEIGHT = Math.sqrt(3) / 2
/** Linear scale matching the area of an equilateral triangle to a square cell. */
export const TRIANGLE_OVERLAY_SCALE = Math.sqrt(TRIANGLE_HEIGHT / 2)
export const HEX_RADIUS = 1 / Math.sqrt(3)
export const HEX_OVERLAY_SCALE = Math.sqrt(Math.sqrt(3) / 2)
/** Maximum editable visual width for a rectangular triangle grid. */
export const TRIANGLE_RECTANGLE_VISUAL_COLS_MAX = 250

/** Converts the displayed width of a rectangular triangle grid to its cell columns. */
export function triangleRectangleVisualColsToCellCols(visualCols: number): number {
  return visualCols * 2 - 1
}

/** Converts rectangular triangle cell columns to the displayed visual width. */
export function triangleRectangleCellColsToVisualCols(cellCols: number): number {
  return (cellCols + 1) / 2
}

export function getOverlayScale(runtime: Maze): number {
  return runtime.grid.type === 'triangle'
    ? TRIANGLE_OVERLAY_SCALE
    : runtime.grid.type === 'hexagon'
      ? HEX_OVERLAY_SCALE
      : 1
}

export function getGridBounds(runtime: Maze): GridBounds {
  if (runtime.grid.type !== 'hexagon') {
    return runtime.grid.type === 'triangle'
      ? { height: runtime.grid.rows * TRIANGLE_HEIGHT, width: (runtime.grid.cols + 1) / 2 }
      : { height: runtime.grid.rows, width: runtime.grid.cols }
  }
  const points = runtime.grid.cells.flatMap(getCellPolygon)
  return {
    height: Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y)),
    width: Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x)),
  }
}

export function getViewportRatioRows(
  cols: number,
  viewportHeightWidthRatio: number,
  gridType: MazeGridType,
): number {
  const worldWidth = gridType === 'triangle' ? (cols + 1) / 2 : cols
  const cellHeight = gridType === 'triangle' ? TRIANGLE_HEIGHT : 1
  return Math.round((worldWidth * viewportHeightWidthRatio) / cellHeight)
}

export function getCellCenter(cell: GridCell): WorldPoint {
  if (cell instanceof HexCell) {
    return { x: cell.worldX, y: cell.worldY }
  }
  if (cell instanceof TriangleCell) {
    return {
      x: cell.offsetX + cell.col / 2 + 0.5,
      y: cell.row * TRIANGLE_HEIGHT
        + (cell.orientation === 'up' ? TRIANGLE_HEIGHT * 2 / 3 : TRIANGLE_HEIGHT / 3),
    }
  }
  return { x: cell.col + 0.5, y: cell.row + 0.5 }
}

export function getPointCenter(runtime: Maze, point: MazePoint): WorldPoint {
  const cell = runtime.grid.getCell(`${point.y}:${point.x}`)
  return cell ? getCellCenter(cell) : { x: point.x + 0.5, y: point.y + 0.5 }
}

export function getCellPolygon(cell: GridCell): WorldPoint[] {
  if (cell instanceof HexCell) {
    const startAngle = cell.orientation === 'pointy' ? -Math.PI / 2 : 0
    return Array.from({ length: 6 }, (_, index) => {
      const angle = startAngle + index * Math.PI / 3
      return {
        x: cell.worldX + HEX_RADIUS * Math.cos(angle),
        y: cell.worldY + HEX_RADIUS * Math.sin(angle),
      }
    })
  }
  if (!(cell instanceof TriangleCell)) {
    return [
      { x: cell.col, y: cell.row },
      { x: cell.col + 1, y: cell.row },
      { x: cell.col + 1, y: cell.row + 1 },
      { x: cell.col, y: cell.row + 1 },
    ]
  }

  const left = cell.offsetX + cell.col / 2
  const top = cell.row * TRIANGLE_HEIGHT
  return cell.orientation === 'up'
    ? [
        { x: left + 0.5, y: top },
        { x: left + 1, y: top + TRIANGLE_HEIGHT },
        { x: left, y: top + TRIANGLE_HEIGHT },
      ]
    : [
        { x: left, y: top },
        { x: left + 1, y: top },
        { x: left + 0.5, y: top + TRIANGLE_HEIGHT },
      ]
}

export function getCellBoundarySegments(
  cell: GridCell,
): Array<GridSegment & { edge: MazeEdge | null, opened: boolean }> {
  const polygon = getCellPolygon(cell)
  if (cell instanceof TriangleCell) {
    const edgeOrder = cell.orientation === 'up'
      ? [cell.edges.right, cell.edges.bottom, cell.edges.left]
      : [cell.edges.top, cell.edges.right, cell.edges.left]
    return polygon.map((from, index) => ({
      edge: edgeOrder[index] ?? null,
      from,
      opened: edgeOrder[index]?.opened ?? false,
      to: polygon[(index + 1) % polygon.length],
    }))
  }

  if (cell instanceof HexCell) {
    const edgeOrder = isPointyHex(cell)
      ? [cell.hexEdges.ne, cell.hexEdges.e, cell.hexEdges.se, cell.hexEdges.sw, cell.hexEdges.w, cell.hexEdges.nw]
      : [cell.hexEdges.e, cell.hexEdges.se, cell.hexEdges.sw, cell.hexEdges.w, cell.hexEdges.nw, cell.hexEdges.ne]
    return polygon.map((from, index) => ({
      edge: edgeOrder[index] ?? null,
      from,
      opened: edgeOrder[index]?.opened ?? false,
      to: polygon[(index + 1) % polygon.length],
    }))
  }

  const edgeOrder = [cell.edges.top, cell.edges.right, cell.edges.bottom, cell.edges.left]
  return polygon.map((from, index) => ({
    edge: edgeOrder[index] ?? null,
    from,
    opened: edgeOrder[index]?.opened ?? false,
    to: polygon[(index + 1) % polygon.length],
  }))
}

export function visitGridLines(runtime: Maze, visit: (segment: GridSegment) => void): void {
  const unique = new Map<string, GridSegment>()
  for (const cell of runtime.grid.cells) {
    for (const segment of getCellBoundarySegments(cell)) {
      unique.set(segmentKey(segment), canonicalSegment(segment))
    }
  }
  for (const segment of unique.values()) {
    visit(segment)
  }
}

export function visitClosedWalls(runtime: Maze, visit: (segment: GridSegment) => void): void {
  const unique = new Map<string, GridSegment>()
  for (const cell of runtime.grid.cells) {
    for (const segment of getCellBoundarySegments(cell)) {
      if (!segment.opened) {
        unique.set(segmentKey(segment), canonicalSegment(segment))
      }
    }
  }
  for (const segment of unique.values()) {
    visit(segment)
  }
}

export function hitTestCell(runtime: Maze, point: WorldPoint): GridCell | null {
  if (runtime.grid.type === 'square') {
    return runtime.grid.getCell(`${Math.floor(point.y)}:${Math.floor(point.x)}`) ?? null
  }
  if (runtime.grid.type === 'hexagon') {
    return runtime.grid.cells.find(cell => pointInPolygon(point, getCellPolygon(cell))) ?? null
  }
  const grid = runtime.grid as TriangleGrid
  const approximateRow = Math.floor(point.y / TRIANGLE_HEIGHT)
  for (let row = approximateRow - 1; row <= approximateRow + 1; row += 1) {
    const offsetX = grid.layout === 'triangle' ? (grid.size! - row - 1) / 2 : 0
    const approximateCol = Math.floor((point.x - offsetX) * 2)
    for (let col = approximateCol - 2; col <= approximateCol + 1; col += 1) {
      const cell = grid.getCell(`${row}:${col}`)
      if (cell && pointInPolygon(point, getCellPolygon(cell))) {
        return cell
      }
    }
  }
  return null
}

function isPointyHex(cell: HexCell): boolean {
  return cell.orientation === 'pointy'
}

export function getSharedBoundary(left: GridCell, right: GridCell): GridSegment | null {
  const rightKeys = new Set(getCellBoundarySegments(right).map(segmentKey))
  return getCellBoundarySegments(left).find(segment => rightKeys.has(segmentKey(segment))) ?? null
}

export function distanceToSegment(point: WorldPoint, segment: GridSegment): number {
  const dx = segment.to.x - segment.from.x
  const dy = segment.to.y - segment.from.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return Math.hypot(point.x - segment.from.x, point.y - segment.from.y)
  }
  const projection = Math.max(0, Math.min(1, ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) / lengthSquared))
  return Math.hypot(
    point.x - (segment.from.x + projection * dx),
    point.y - (segment.from.y + projection * dy),
  )
}

function segmentKey(segment: GridSegment): string {
  const left = pointKey(segment.from)
  const right = pointKey(segment.to)
  return left < right ? `${left}>${right}` : `${right}>${left}`
}

function canonicalSegment(segment: GridSegment): GridSegment {
  return pointKey(segment.from) < pointKey(segment.to)
    ? segment
    : { from: segment.to, to: segment.from }
}

function pointKey(point: WorldPoint): string {
  return `${point.x.toFixed(6)},${point.y.toFixed(6)}`
}

function pointInPolygon(point: WorldPoint, polygon: WorldPoint[]): boolean {
  let sign = 0
  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index]
    const to = polygon[(index + 1) % polygon.length]
    const cross = (to.x - from.x) * (point.y - from.y)
      - (to.y - from.y) * (point.x - from.x)
    if (Math.abs(cross) < 1e-9) {
      continue
    }
    const nextSign = Math.sign(cross)
    if (sign !== 0 && nextSign !== sign) {
      return false
    }
    sign = nextSign
  }
  return true
}
