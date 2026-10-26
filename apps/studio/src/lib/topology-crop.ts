import type { CircleCropHandle, CropPoint } from './circle-crop'
import type { ShapeGridTopology } from './shape-mask'
import { buildRingCellCounts, createMaze } from 'mazely'
import { createCircleCrop, dragCircleCrop } from './circle-crop'
import { getCellBoundarySegments, getGridBounds } from './grid-geometry'
import { getShapeGridDimensions } from './shape-mask'

export interface ShapeCrop { x: number, y: number, width: number, height: number }
export interface TopologyCropLayout {
  cols: number
  rows: number
  mask: boolean[][]
  aspect: number
  outline: CropPoint[]
  segments: Array<{ from: CropPoint, to: CropPoint }>
}

export function createShapeCrop(width: number, height: number, aspect: number): ShapeCrop {
  const crop = createCircleCrop(width, height * aspect)
  return { x: crop.x, y: crop.y / aspect, width: crop.size, height: crop.size / aspect }
}

export function getShapeCropCorners(crop: ShapeCrop): Array<{ handle: Exclude<CircleCropHandle, 'move'>, point: CropPoint }> {
  return [
    { handle: 'nw', point: { x: crop.x, y: crop.y } },
    { handle: 'ne', point: { x: crop.x + crop.width, y: crop.y } },
    { handle: 'sw', point: { x: crop.x, y: crop.y + crop.height } },
    { handle: 'se', point: { x: crop.x + crop.width, y: crop.y + crop.height } },
  ]
}

export function dragShapeCrop(crop: ShapeCrop, handle: CircleCropHandle, start: CropPoint, point: CropPoint, width: number, height: number): ShapeCrop {
  const aspect = crop.width / crop.height
  const result = dragCircleCrop({ x: crop.x, y: crop.y * aspect, size: crop.width }, handle, { x: start.x, y: start.y * aspect }, { x: point.x, y: point.y * aspect }, width, height * aspect)
  return { x: result.x, y: result.y / aspect, width: result.size, height: result.size / aspect }
}

export function hitShapeCrop(crop: ShapeCrop, point: CropPoint, tolerance: number, outline: CropPoint[]): CircleCropHandle | null {
  for (const corner of getShapeCropCorners(crop)) {
    if (Math.abs(point.x - corner.point.x) <= tolerance && Math.abs(point.y - corner.point.y) <= tolerance)
      return corner.handle
  }
  const x = (point.x - crop.x) / crop.width
  const y = (point.y - crop.y) / crop.height
  let inside = false
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i]
    const b = outline[j]
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)
      inside = !inside
  }
  return inside ? 'move' : null
}

/** Use the real cell boundaries, including the stepped outline of hex grids. */
export function buildTopologyCropLayout(size: number, topology: ShapeGridTopology, aspect = 1): TopologyCropLayout {
  const { cols, rows } = getShapeGridDimensions(aspect, 1, size, topology)
  const runtime = createMaze({ grid: topology.type === 'circular'
    ? { type: 'circular', rings: size }
    : topology.type === 'square'
      ? { type: 'square', cols, rows }
      : topology.type === 'triangle'
        ? topology.layout === 'triangle'
          ? { type: 'triangle', layout: 'triangle', size }
          : { type: 'triangle', layout: 'rectangle', cols, rows }
        : topology.layout === 'hexagon'
          ? { type: 'hexagon', layout: 'hexagon', orientation: topology.orientation, size }
          : { type: 'hexagon', layout: 'rectangle', orientation: topology.orientation, cols, rows } })
  const bounds = getGridBounds(runtime)
  const ringCounts = topology.type === 'circular' ? buildRingCellCounts(rows) : []
  const mask = Array.from({ length: runtime.grid.rows }, (_, row) => Array.from({
    length: topology.type === 'circular' ? ringCounts[row] : topology.type === 'triangle' && topology.layout === 'triangle' ? row * 2 + 1 : runtime.grid.cols,
  }, () => false))
  const edges = new Map<string, { from: CropPoint, to: CropPoint }>()
  const boundary = new Map<string, { point: CropPoint, neighbors: string[] }>()
  const key = (point: CropPoint) => `${point.x.toFixed(7)}:${point.y.toFixed(7)}`
  for (const cell of runtime.grid.cells) {
    mask[cell.row][cell.col] = true
    for (const segment of getCellBoundarySegments(cell)) {
      const from = { x: segment.from.x / bounds.width, y: segment.from.y / bounds.height }
      const to = { x: segment.to.x / bounds.width, y: segment.to.y / bounds.height }
      const a = key(from)
      const b = key(to)
      edges.set(a < b ? `${a}>${b}` : `${b}>${a}`, { from, to })
      if (!segment.edge) {
        for (const [id, point, other] of [[a, from, b], [b, to, a]] as const) {
          const vertex = boundary.get(id) ?? { point, neighbors: [] }
          vertex.neighbors.push(other)
          boundary.set(id, vertex)
        }
      }
    }
  }
  const outline: CropPoint[] = []
  const first = boundary.keys().next().value!
  let current = first
  let previous = ''
  do {
    const vertex = boundary.get(current)!
    outline.push(vertex.point)
    const next = vertex.neighbors.find(id => id !== previous)!
    previous = current
    current = next
  } while (current !== first && outline.length <= boundary.size)
  return { cols: runtime.grid.cols, rows: runtime.grid.rows, mask, aspect: bounds.width / bounds.height, outline, segments: [...edges.values()] }
}
