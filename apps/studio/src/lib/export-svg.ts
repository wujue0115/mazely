import type { Maze, MazeGrid, MazePoint, SquareCell } from 'mazely'
import type { FloodTheme } from './flood'
import type { MazeViewState } from './maze-types'
import type { StyleTheme, StyleVisibility } from './types'
import { pointToCellId } from 'mazely'
import { getFloodDepthColor } from './flood'
import { hasOpenCellEdge } from './runtime'
import { FIXED_CELL_SIZE } from './types'

interface ExportSvgOptions {
  flood?: {
    depthByKey: Record<string, number>
    theme: FloodTheme
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
  const width = maze.cols * FIXED_CELL_SIZE
  const height = maze.rows * FIXED_CELL_SIZE
  const grid = runtime.grid
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
      parts.push(rect(cell.col * FIXED_CELL_SIZE, cell.row * FIXED_CELL_SIZE, FIXED_CELL_SIZE, FIXED_CELL_SIZE, color))
    }
  }

  if (visibleElements.visit && options.solve && !options.flood) {
    for (const point of options.solve.visited) {
      if (grid.getCell(pointToCellId(point))) {
        parts.push(rect(point.x * FIXED_CELL_SIZE, point.y * FIXED_CELL_SIZE, FIXED_CELL_SIZE, FIXED_CELL_SIZE, theme.visit))
      }
    }
  }

  if (visibleElements.wall) {
    parts.push(...buildWallSegments(grid).map(segment => line(segment, theme.wall)))
  }

  if (visibleElements.path && options.solve) {
    parts.push(...buildPolylineSegments([options.solve.path], theme.path, 0.18))
    parts.push(...buildPolylineSegments(options.solve.trails, theme.path, 0.14))
  }

  if (visibleElements.head && options.solve) {
    for (const point of options.solve.heads) {
      if (grid.getCell(pointToCellId(point))) {
        parts.push(pointMarker(point, theme.head, 0.22))
      }
    }
  }

  if (pointMarkers.start && grid.getCell(pointToCellId(maze.start))) {
    parts.push(pointMarker(maze.start, theme.start))
  }
  if (pointMarkers.end && grid.getCell(pointToCellId(maze.end))) {
    parts.push(pointMarker(maze.end, theme.end))
  }

  parts.push('</svg>')
  return parts.join('')
}

function buildWallSegments(grid: MazeGrid<SquareCell>): Segment[] {
  const segments = new Map<string, Segment>()

  for (const cell of grid.cells) {
    addWallIfClosed(segments, cell.edges.top, cell.col, cell.row, cell.col + 1, cell.row)
    addWallIfClosed(segments, cell.edges.right, cell.col + 1, cell.row, cell.col + 1, cell.row + 1)
    addWallIfClosed(segments, cell.edges.bottom, cell.col, cell.row + 1, cell.col + 1, cell.row + 1)
    addWallIfClosed(segments, cell.edges.left, cell.col, cell.row, cell.col, cell.row + 1)
  }

  return [...segments.values()]
}

function buildPolylineSegments(polylines: MazePoint[][], stroke: string, widthRatio: number): string[] {
  const parts: string[] = []
  for (const points of polylines) {
    for (let index = 0; index < points.length - 1; index += 1) {
      const from = points[index]
      const to = points[index + 1]
      parts.push(line({
        x1: (from.x + 0.5) * FIXED_CELL_SIZE,
        x2: (to.x + 0.5) * FIXED_CELL_SIZE,
        y1: (from.y + 0.5) * FIXED_CELL_SIZE,
        y2: (to.y + 0.5) * FIXED_CELL_SIZE,
      }, stroke, FIXED_CELL_SIZE * widthRatio))
    }
  }
  return parts
}

function addWallIfClosed(
  segments: Map<string, Segment>,
  edge: SquareCell['edges'][keyof SquareCell['edges']],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void {
  if (edge?.opened) {
    return
  }

  const scaled = {
    x1: x1 * FIXED_CELL_SIZE,
    x2: x2 * FIXED_CELL_SIZE,
    y1: y1 * FIXED_CELL_SIZE,
    y2: y2 * FIXED_CELL_SIZE,
  }
  const key = `${scaled.x1}:${scaled.y1}:${scaled.x2}:${scaled.y2}`
  segments.set(key, scaled)
}

function rect(x: number, y: number, width: number, height: number, fill: string): string {
  return [
    `<rect x="${x}" y="${y}" width="${width}" height="${height}"`,
    ` fill="${escapeXml(fill)}" shape-rendering="crispEdges"/>`,
  ].join('')
}

function line(segment: Segment, stroke: string, strokeWidth = 2): string {
  return [
    `<line x1="${formatNumber(segment.x1)}" y1="${formatNumber(segment.y1)}" x2="${formatNumber(segment.x2)}" y2="${formatNumber(segment.y2)}"`,
    ` stroke="${escapeXml(stroke)}" stroke-width="${formatNumber(strokeWidth)}" stroke-linecap="square"/>`,
  ].join('')
}

function pointMarker(point: MazePoint, fill: string, radiusRatio = 0.28): string {
  const radius = FIXED_CELL_SIZE * radiusRatio
  return [
    `<circle cx="${formatNumber((point.x + 0.5) * FIXED_CELL_SIZE)}" cy="${formatNumber((point.y + 0.5) * FIXED_CELL_SIZE)}"`,
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
