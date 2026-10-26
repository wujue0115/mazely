import type { CircularCell, Maze, MazeEdge } from 'mazely'
import * as THREE from 'three'
import { getPolarBoundaries } from './grid-geometry'
import { getPolarArcSegments } from './polar-resolution'

interface Point { x: number, y: number }
interface WallRange {
  edges: (MazeEdge | null)[]
  start: number
  count: number
  visible: boolean
}

/** Fixed wall buffers: carving only changes the indices of affected walls. */
export class CircularWallGeometry extends THREE.BufferGeometry {
  private readonly ranges: WallRange[] = []

  constructor(readonly runtime: Maze, readonly thickness: number, readonly height?: number, z = 0.01) {
    super()
    const positions: number[] = []
    const seen = new Set<string>()
    const joins = new Map<string, { point: Point, edges: (MazeEdge | null)[] }>()
    const triangle = (a: Point, b: Point, c: Point, level = height ?? z) => {
      for (const point of [a, b, c]) {
        if (height === undefined)
          positions.push(point.x, -point.y, level)
        else positions.push(point.x, level, point.y)
      }
    }
    const quad = (a: Point, b: Point, c: Point, d: Point) => {
      triangle(a, b, c)
      triangle(a, c, d)
      if (height === undefined)
        return
      // The floor covers the bottom; only top and side faces need vertices.
      for (const [from, to] of [[a, b], [b, c], [c, d], [d, a]]) {
        positions.push(from.x, 0, from.y, to.x, 0, to.y, to.x, height, to.y, from.x, 0, from.y, to.x, height, to.y, from.x, height, from.y)
      }
    }
    const join = (point: Point, edge: MazeEdge | null) => {
      const key = `${point.x.toFixed(6)}:${point.y.toFixed(6)}`
      const existing = joins.get(key)
      if (existing)
        existing.edges.push(edge)
      else joins.set(key, { point, edges: [edge] })
    }
    const range = (start: number, edges: (MazeEdge | null)[]) => {
      this.ranges.push({ start, count: positions.length / 3 - start, edges, visible: true })
    }
    for (const cell of runtime.grid.cells) {
      for (const boundary of getPolarBoundaries(cell as CircularCell)) {
        const key = boundary.edge?.id ?? `${cell.id}:${boundary.kind}:${boundary.kind === 'arc' ? `${boundary.radius}:${boundary.startAngle}:${boundary.endAngle}` : `${boundary.from.x}:${boundary.from.y}:${boundary.to.x}:${boundary.to.y}`}`
        if (seen.has(key))
          continue
        seen.add(key)
        const start = positions.length / 3
        if (boundary.kind === 'radial') {
          const { from, to } = boundary
          const dx = to.x - from.x
          const dy = to.y - from.y
          const length = Math.hypot(dx, dy)
          const nx = -dy / length * thickness / 2
          const ny = dx / length * thickness / 2
          quad({ x: from.x + nx, y: from.y + ny }, { x: from.x - nx, y: from.y - ny }, { x: to.x - nx, y: to.y - ny }, { x: to.x + nx, y: to.y + ny })
          join(from, boundary.edge)
          join(to, boundary.edge)
        }
        else {
          const divisions = getPolarArcSegments(boundary.radius, boundary.endAngle - boundary.startAngle)
          const inner = Math.max(0, boundary.radius - thickness / 2)
          const outer = boundary.radius + thickness / 2
          const point = (radius: number, angle: number) => ({ x: boundary.center.x + radius * Math.cos(angle), y: boundary.center.y + radius * Math.sin(angle) })
          for (let index = 0; index < divisions; index += 1) {
            const a = boundary.startAngle + (boundary.endAngle - boundary.startAngle) * index / divisions
            const b = boundary.startAngle + (boundary.endAngle - boundary.startAngle) * (index + 1) / divisions
            quad(point(inner, a), point(outer, a), point(outer, b), point(inner, b))
          }
          join(point(boundary.radius, boundary.startAngle), boundary.edge)
          join(point(boundary.radius, boundary.endAngle), boundary.edge)
        }
        range(start, [boundary.edge])
      }
    }
    for (const { point: center, edges } of joins.values()) {
      const start = positions.length / 3
      const angle = Math.atan2(center.y - runtime.grid.rows, center.x - runtime.grid.rows)
      const radial = { x: Math.cos(angle), y: Math.sin(angle) }
      const tangent = { x: -radial.y, y: radial.x }
      const half = thickness / 2
      const point = (r: number, t: number) => ({ x: center.x + radial.x * r + tangent.x * t, y: center.y + radial.y * r + tangent.y * t })
      quad(point(-half, -half), point(-half, half), point(half, half), point(half, -half))
      range(start, edges)
    }
    this.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const indices = new Uint32Array(positions.length / 3)
    for (let index = 0; index < indices.length; index += 1) indices[index] = index
    this.setIndex(new THREE.BufferAttribute(indices, 1).setUsage(THREE.DynamicDrawUsage))
    if (height !== undefined)
      this.computeVertexNormals()
    this.syncVisibility()
  }

  syncVisibility(): void {
    const indices = this.getIndex()!
    let changed = false
    for (const range of this.ranges) {
      const visible = range.edges.some(edge => !edge || !edge.opened)
      if (range.visible === visible)
        continue
      range.visible = visible
      for (let index = range.start; index < range.start + range.count; index += 1) indices.setX(index, visible ? index : 0)
      indices.addUpdateRange(range.start, range.count)
      changed = true
    }
    if (changed)
      indices.needsUpdate = true
  }
}
