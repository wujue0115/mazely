import type { GridCell, Maze, MazePoint } from 'mazely'
import type { FloodColorSource } from './flood'
import type { MazeViewState } from './maze-types'
import type { StyleTheme, StyleVisibility } from './types'
import { pointToCellId } from 'mazely'
import { getFloodDepthColor } from './flood'
import { getCellPolygon, getGridBounds, getOverlayScale, getPointCenter, visitClosedWalls } from './grid-geometry'
import { hasOpenCellEdge } from './runtime'
import { FIXED_CELL_SIZE } from './types'

interface ExportSvgOptions {
  flood?: {
    depthByKey: Record<string, number>
    theme: FloodColorSource
  }
  pointMarkers?: {
    end: boolean
    start: boolean
  }
  maze: MazeViewState
  runtime: Maze
  solve?: ExportSvgSolveState
  theme: StyleTheme
  visibleElements: StyleVisibility
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
  const width = bounds.width * FIXED_CELL_SIZE
  const height = bounds.height * FIXED_CELL_SIZE
  const grid = runtime.grid
  const overlayScale = getOverlayScale(runtime)
  const parts = [
    '<svg xmlns="http://www.w3.org/2000/svg"',
    ` width="${width}" height="${height}"`,
    ` viewBox="0 0 ${width} ${height}"`,
    ' role="img" aria-label="Mazely maze">',
  ]

  for (const cell of grid.cells) {
    const floodDepth = options.flood?.depthByKey[`${cell.col},${cell.row}`]
    const linked = hasOpenCellEdge(runtime, cell.col, cell.row)
    if (floodDepth !== undefined || (linked && visibleElements.cell) || (!linked && visibleElements.unlinkedCell)) {
      const color = floodDepth === undefined
        ? (linked ? theme.cell : theme.unlinkedCell)
        : getFloodDepthColor(options.flood!.theme, floodDepth, maze.rows, maze.cols)
      parts.push(cellShape(cell, color))
    }
  }

  if (visibleElements.visit && options.solve && !options.flood) {
    for (const point of options.solve.visited) {
      if (grid.getCell(pointToCellId(point))) {
        parts.push(cellShape(grid.getCell(pointToCellId(point))!, theme.visit))
      }
    }
  }

  if (visibleElements.wall) {
    parts.push(...buildWallSegments(runtime).map(segment => line(segment, theme.wall)))
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

  if (pointMarkers.start && grid.getCell(pointToCellId(maze.start))) {
    parts.push(pointMarker(runtime, maze.start, theme.start, 0.28 * overlayScale))
  }
  if (pointMarkers.end && grid.getCell(pointToCellId(maze.end))) {
    parts.push(pointMarker(runtime, maze.end, theme.end, 0.28 * overlayScale))
  }

  parts.push('</svg>')
  return parts.join('')
}

function buildWallSegments(runtime: Maze): Segment[] {
  const segments: Segment[] = []
  visitClosedWalls(runtime, segment => segments.push({
    x1: segment.from.x * FIXED_CELL_SIZE,
    x2: segment.to.x * FIXED_CELL_SIZE,
    y1: segment.from.y * FIXED_CELL_SIZE,
    y2: segment.to.y * FIXED_CELL_SIZE,
  }))
  return segments
}

function buildPolylineSegments(runtime: Maze, polylines: MazePoint[][], stroke: string, widthRatio: number): string[] {
  const parts: string[] = []
  for (const points of polylines) {
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index]
      const to = points[index + 1]
      const fromCenter = getPointCenter(runtime, from)
      const toCenter = getPointCenter(runtime, to)
      parts.push(line({
        x1: fromCenter.x * FIXED_CELL_SIZE,
        x2: toCenter.x * FIXED_CELL_SIZE,
        y1: fromCenter.y * FIXED_CELL_SIZE,
        y2: toCenter.y * FIXED_CELL_SIZE,
      }, stroke, FIXED_CELL_SIZE * widthRatio))
    }
  }
  return parts
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

function line(segment: Segment, stroke: string, strokeWidth = 2): string {
  return [
    `<line x1="${formatNumber(segment.x1)}" y1="${formatNumber(segment.y1)}" x2="${formatNumber(segment.x2)}" y2="${formatNumber(segment.y2)}"`,
    ` stroke="${escapeXml(stroke)}" stroke-width="${formatNumber(strokeWidth)}" stroke-linecap="square"/>`,
  ].join('')
}

function pointMarker(runtime: Maze, point: MazePoint, fill: string, radiusRatio = 0.28): string {
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
