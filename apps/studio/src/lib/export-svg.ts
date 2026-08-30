import type { GridCell, Maze, MazePoint } from 'mazely'
import type { FloodColorSource } from './flood'
import type { MazeViewState } from './maze-types'
import type { StyleTheme, StyleVisibility } from './types'
import { pointToCellId } from 'mazely'
import { getFloodDepthColor } from './flood'
import { getCellPolygon, getGridBounds, getOverlayScale, getPointCenter, visitClosedWalls, visitGridLines } from './grid-geometry'
import { hasOpenCellEdge } from './runtime'
import { FIXED_CELL_SIZE } from './types'
import { buildTriangleWallPositions } from './webgl-2d-view'

interface ExportSvgOptions {
  cellColor?: (x: number, y: number) => string
  flood?: {
    depthByKey: Record<string, number>
    theme: FloodColorSource
  }
  pointMarkers?: {
    end: boolean
    start: boolean
  }
  maze: MazeViewState
  overlays?: ExportSvgOverlayState
  runtime: Maze
  solve?: ExportSvgSolveState
  theme: StyleTheme
  visibleElements: StyleVisibility
  wallThickness?: number
}

export interface ExportSvgOverlayState {
  dots: Array<{ color: string, point: MazePoint, radius: number }>
  segments: Array<{
    cap?: 'butt' | 'square'
    color: string
    from: MazePoint
    to: MazePoint
    width: number
  }>
}

interface ExportSvgSolveState {
  frontierHeads?: MazePoint[]
  frontierTrails?: MazePoint[][]
  heads: MazePoint[]
  path: MazePoint[]
  trails: MazePoint[][]
  visited: MazePoint[]
}

interface Segment {
  x1: number
  x2: number
  y1: number
  y2: number
}

export function buildMazeSvg(options: ExportSvgOptions): string {
  const { maze, runtime, theme, visibleElements } = options
  const pointMarkers = options.pointMarkers ?? {
    end: visibleElements.end && !options.flood,
    start: visibleElements.start
      && (!options.flood || Object.keys(options.flood.depthByKey).length === 0),
  }
  const bounds = getGridBounds(runtime)
  const mazeWidth = bounds.width * FIXED_CELL_SIZE
  const mazeHeight = bounds.height * FIXED_CELL_SIZE
  const padding = getVisualPadding(options)
  const width = mazeWidth + padding * 2
  const height = mazeHeight + padding * 2
  const grid = runtime.grid
  const overlayScale = getOverlayScale(runtime)
  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    ` width="${formatNumber(width)}" height="${formatNumber(height)}"`,
    ` viewBox="${formatNumber(-padding)} ${formatNumber(-padding)} ${formatNumber(width)} ${formatNumber(height)}"`,
    ' role="img" aria-label="Mazely maze">',
  ]

  for (const cell of grid.cells) {
    if (options.cellColor) {
      parts.push(cellShape(cell, options.cellColor(cell.col, cell.row)))
      continue
    }
    const floodDepth = options.flood?.depthByKey[`${cell.col},${cell.row}`]
    const linked = hasOpenCellEdge(runtime, cell.col, cell.row)
    if (floodDepth !== undefined || (linked && visibleElements.cell) || (!linked && visibleElements.unlinkedCell)) {
      parts.push(cellShape(cell, floodDepth === undefined
        ? (linked ? theme.cell : theme.unlinkedCell)
        : getFloodDepthColor(options.flood!.theme, floodDepth, maze.rows, maze.cols)))
    }
  }

  if (!options.cellColor && visibleElements.visit && options.solve && !options.flood) {
    for (const point of options.solve.visited) {
      if (grid.getCell(pointToCellId(point))) {
        parts.push(cellShape(grid.getCell(pointToCellId(point))!, theme.visit))
      }
    }
  }

  if (visibleElements.wall) {
    parts.push(...buildWalls(runtime, theme.wall, options.wallThickness ?? 2))
  }

  if (visibleElements.grid) {
    parts.push(...buildGridSegments(runtime).map(segment =>
      line(segment, theme.grid, options.wallThickness ?? 2)))
  }

  if (visibleElements.subPath && options.solve?.frontierTrails) {
    parts.push(...buildPolylineSegments(runtime, options.solve.frontierTrails, theme.subPath, 0.14 * overlayScale))
  }

  if (visibleElements.path && options.solve) {
    parts.push(...buildPolylineSegments(runtime, [options.solve.path], theme.path, 0.18 * overlayScale))
    parts.push(...buildPolylineSegments(runtime, options.solve.trails, theme.path, 0.14 * overlayScale))
  }

  if (visibleElements.frontier && options.solve?.frontierHeads) {
    for (const point of options.solve.frontierHeads) {
      if (grid.getCell(pointToCellId(point))) {
        parts.push(pointMarker(runtime, point, theme.frontier, 0.22 * overlayScale))
      }
    }
  }

  if (visibleElements.head && options.solve) {
    for (const point of options.solve.heads) {
      if (grid.getCell(pointToCellId(point))) {
        parts.push(pointMarker(runtime, point, theme.head, 0.22 * overlayScale))
      }
    }
  }

  if (options.overlays) {
    for (const segment of options.overlays.segments) {
      parts.push(overlayLine(runtime, segment))
    }
    for (const dot of options.overlays.dots) {
      parts.push(pointMarker(runtime, dot.point, dot.color, dot.radius))
    }
  }

  if (pointMarkers.start && grid.getCell(pointToCellId(maze.start))) {
    parts.push(pointMarker(runtime, maze.start, theme.start, 0.25 * overlayScale))
  }
  if (pointMarkers.end && grid.getCell(pointToCellId(maze.end))) {
    parts.push(pointMarker(runtime, maze.end, theme.end, 0.25 * overlayScale))
  }

  parts.push('</svg>')
  return parts.join('')
}

function getVisualPadding(options: ExportSvgOptions): number {
  if (!options.visibleElements.wall && !options.visibleElements.grid) {
    return 0
  }
  return options.wallThickness ?? 2
}

function buildGridSegments(runtime: Maze): Segment[] {
  const segments: Segment[] = []
  visitGridLines(runtime, segment => segments.push({
    x1: segment.from.x * FIXED_CELL_SIZE,
    x2: segment.to.x * FIXED_CELL_SIZE,
    y1: segment.from.y * FIXED_CELL_SIZE,
    y2: segment.to.y * FIXED_CELL_SIZE,
  }))
  return segments
}

function buildWalls(runtime: Maze, fill: string, thickness: number): string[] {
  if (runtime.grid.type === 'triangle') {
    const positions = buildTriangleWallPositions(runtime, thickness / FIXED_CELL_SIZE)
    const commands: string[] = []
    for (let offset = 0; offset < positions.length; offset += 9) {
      const points = [
        { x: positions[offset] * FIXED_CELL_SIZE, y: -positions[offset + 1] * FIXED_CELL_SIZE },
        { x: positions[offset + 3] * FIXED_CELL_SIZE, y: -positions[offset + 4] * FIXED_CELL_SIZE },
        { x: positions[offset + 6] * FIXED_CELL_SIZE, y: -positions[offset + 7] * FIXED_CELL_SIZE },
      ]
      const signedArea = (points[1].x - points[0].x) * (points[2].y - points[0].y)
        - (points[1].y - points[0].y) * (points[2].x - points[0].x)
      if (signedArea < 0) {
        [points[1], points[2]] = [points[2], points[1]]
      }
      commands.push(
        `M ${formatNumber(points[0].x)} ${formatNumber(points[0].y)}`,
        `L ${formatNumber(points[1].x)} ${formatNumber(points[1].y)}`,
        `L ${formatNumber(points[2].x)} ${formatNumber(points[2].y)} Z`,
      )
    }
    return commands.length > 0
      ? [`<path d="${commands.join(' ')}" fill="${escapeXml(fill)}"/>`]
      : []
  }

  const segments: Segment[] = []
  visitClosedWalls(runtime, segment => segments.push({
    x1: segment.from.x * FIXED_CELL_SIZE,
    x2: segment.to.x * FIXED_CELL_SIZE,
    y1: segment.from.y * FIXED_CELL_SIZE,
    y2: segment.to.y * FIXED_CELL_SIZE,
  }))
  return segments.map(segment => line(segment, fill, thickness))
}

function buildPolylineSegments(runtime: Maze, polylines: MazePoint[][], stroke: string, widthRatio: number): string[] {
  const parts: string[] = []
  for (const points of polylines) {
    if (points.length >= 2) {
      const coordinates = points.map((point) => {
        const center = getPointCenter(runtime, point)
        return `${formatNumber(center.x * FIXED_CELL_SIZE)},${formatNumber(center.y * FIXED_CELL_SIZE)}`
      }).join(' ')
      parts.push([
        `<polyline points="${coordinates}" fill="none" stroke="${escapeXml(stroke)}"`,
        ` stroke-width="${formatNumber(FIXED_CELL_SIZE * widthRatio)}" stroke-linecap="butt" stroke-linejoin="round"/>`,
      ].join(''))
    }
  }
  return parts
}

function overlayLine(
  runtime: Maze,
  segment: ExportSvgOverlayState['segments'][number],
): string {
  const from = getPointCenter(runtime, segment.from)
  const to = getPointCenter(runtime, segment.to)
  return line({
    x1: from.x * FIXED_CELL_SIZE,
    x2: to.x * FIXED_CELL_SIZE,
    y1: from.y * FIXED_CELL_SIZE,
    y2: to.y * FIXED_CELL_SIZE,
  }, segment.color, FIXED_CELL_SIZE * segment.width, segment.cap ?? 'square')
}

function rect(x: number, y: number, width: number, height: number, fill: string): string {
  return [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}"`,
    ` fill="${escapeXml(fill)}" shape-rendering="crispEdges"/>`,
  ].join('')
}

function cellShape(cell: GridCell, fill: string): string {
  if (!('orientation' in cell)) {
    return rect(cell.col * FIXED_CELL_SIZE, cell.row * FIXED_CELL_SIZE, FIXED_CELL_SIZE, FIXED_CELL_SIZE, fill)
  }
  const points = getCellPolygon(cell)
    .map(point => `${formatNumber(point.x * FIXED_CELL_SIZE)},${formatNumber(point.y * FIXED_CELL_SIZE)}`)
    .join(' ')
  return `<polygon points="${points}" fill="${escapeXml(fill)}"/>`
}

function line(segment: Segment, stroke: string, strokeWidth = 2, cap: 'butt' | 'square' = 'square'): string {
  return [
    `<line x1="${formatNumber(segment.x1)}" y1="${formatNumber(segment.y1)}" x2="${formatNumber(segment.x2)}" y2="${formatNumber(segment.y2)}"`,
    ` stroke="${escapeXml(stroke)}" stroke-width="${formatNumber(strokeWidth)}" stroke-linecap="${cap}"/>`,
  ].join('')
}

function pointMarker(runtime: Maze, point: MazePoint, fill: string, radiusRatio = 0.25): string {
  const radius = FIXED_CELL_SIZE * radiusRatio
  const center = getPointCenter(runtime, point)
  return [
    `<circle cx="${formatNumber(center.x * FIXED_CELL_SIZE)}" cy="${formatNumber(center.y * FIXED_CELL_SIZE)}"`,
    ` r="${formatNumber(radius)}" fill="${escapeXml(fill)}"/>`,
  ].join('')
}

function formatNumber(value: number): string {
  return Number(value.toFixed(3)).toString()
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}
