import type { Maze, MazeEdge } from 'mazely'
import type { MazePoint } from './maze-types'
import { HexCell, TriangleCell } from 'mazely'
import * as THREE from 'three'
import { CircularCellGeometry } from './circular-cell-geometry'
import { CircularWallGeometry } from './circular-wall-geometry'
import {
  getCellBoundarySegments,
  getCellCenter,
  getCellPolygon,
  getGridBounds,
  getOverlayScale,
  getPointCenter,
  HEX_RADIUS,
  TRIANGLE_HEIGHT,
  visitClosedWalls,
} from './grid-geometry'
import { getPolarArcSegments } from './polar-resolution'
import { countGridLines, visitReferenceGridLines } from './runtime'
import { FIXED_CELL_SIZE } from './types'
import { getViewportPixelRatio } from './utils'

const CELL_Z = 0
const WALL_Z = 0.01
const LINE_Z = 0.02

function createTriangleGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    0,
    TRIANGLE_HEIGHT * 2 / 3,
    0,
    0.5,
    -TRIANGLE_HEIGHT / 3,
    0,
    -0.5,
    -TRIANGLE_HEIGHT / 3,
    0,
  ], 3))
  geometry.setIndex([0, 1, 2])
  return geometry
}

function createHexGeometry(): THREE.BufferGeometry {
  const positions: number[] = [0, 0, 0]
  for (let index = 0; index < 6; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 3
    positions.push(HEX_RADIUS * Math.cos(angle), HEX_RADIUS * Math.sin(angle), 0)
  }
  const indices: number[] = []
  for (let index = 0; index < 6; index += 1) {
    indices.push(0, index + 1, (index + 1) % 6 + 1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}

/** Builds fixed polar wall buffers; call syncVisibility after carving. */
export function buildCircularWallGeometry(runtime: Maze, thickness: number, z = WALL_Z): CircularWallGeometry {
  return new CircularWallGeometry(runtime, thickness, undefined, z)
}

export function buildCircularPathGeometry(runtime: Maze, paths: Webgl2dPolarPath[]): THREE.BufferGeometry {
  const positions: number[] = []
  const colors: number[] = []
  const joins = new Map<string, { color: string, count: number, point: { x: number, y: number }, width: number, z: number }>()
  const color = new THREE.Color()
  let pathZ = LINE_Z
  const triangle = (a: { x: number, y: number }, b: { x: number, y: number }, c: { x: number, y: number }, value: string) => {
    positions.push(a.x, -a.y, pathZ, b.x, -b.y, pathZ, c.x, -c.y, pathZ)
    color.set(value)
    for (let index = 0; index < 3; index += 1) colors.push(color.r, color.g, color.b)
  }
  let routeIndex = 0
  const addJoin = (point: { x: number, y: number }, width: number, value: string) => {
    const key = `${routeIndex}:${point.x.toFixed(6)}:${point.y.toFixed(6)}`
    const existing = joins.get(key)
    joins.set(key, existing
      ? { ...existing, count: existing.count + 1 }
      : { color: value, count: 1, point, width, z: pathZ })
  }
  const line = (from: { x: number, y: number }, to: { x: number, y: number }, width: number, value: string) => {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    if (length < 1e-6)
      return
    const nx = -dy / length * width / 2
    const ny = dx / length * width / 2
    const a = { x: from.x + nx, y: from.y + ny }
    const b = { x: from.x - nx, y: from.y - ny }
    const c = { x: to.x - nx, y: to.y - ny }
    const d = { x: to.x + nx, y: to.y + ny }
    triangle(a, b, c, value)
    triangle(a, c, d, value)
    addJoin(from, width, value)
    addJoin(to, width, value)
  }
  const arc = (center: { x: number, y: number }, radius: number, start: number, end: number, width: number, value: string) => {
    const delta = (end - start + Math.PI * 3) % (Math.PI * 2) - Math.PI
    if (Math.abs(delta) < 1e-6)
      return
    const steps = getPolarArcSegments(radius, delta)
    const inner = Math.max(0, radius - width / 2)
    const outer = radius + width / 2
    const point = (r: number, angle: number) => ({ x: center.x + r * Math.cos(angle), y: center.y + r * Math.sin(angle) })
    for (let index = 0; index < steps; index += 1) {
      const a = start + delta * index / steps
      const b = start + delta * (index + 1) / steps
      const p1 = point(inner, a)
      const p2 = point(outer, a)
      const p3 = point(outer, b)
      const p4 = point(inner, b)
      triangle(p1, p2, p3, value)
      triangle(p1, p3, p4, value)
    }
    addJoin({ x: center.x + radius * Math.cos(start), y: center.y + radius * Math.sin(start) }, width, value)
    addJoin({ x: center.x + radius * Math.cos(end), y: center.y + radius * Math.sin(end) }, width, value)
  }
  if (runtime.grid.type !== 'circular')
    return new THREE.BufferGeometry()
  type PolarCell = import('mazely').CircularCell
  interface PolarPort {
    /** A radial wall is reached on the cell's annular centerline. */
    kind: 'angular' | 'radial'
    angle: number
    radius: number
  }
  const centerOf = (cell: PolarCell) => ({ x: cell.worldX, y: cell.worldY })
  const midpointAngle = (cell: PolarCell) => (cell.startAngle + cell.endAngle) / 2
  const midpointRadius = (cell: PolarCell) => (cell.innerRadius + cell.outerRadius) / 2
  const pointAt = (cell: PolarCell, radius: number, angle: number) => ({
    x: cell.worldX + radius * Math.cos(angle),
    y: cell.worldY + radius * Math.sin(angle),
  })
  const samePoint = (a: { x: number, y: number }, b: { x: number, y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6
  const commonEdge = (left: PolarCell, right: PolarCell): MazeEdge | undefined =>
    left.getEdges().find(edge => edge.getOther(left)?.id === right.id)
  const portBetween = (left: PolarCell, right: PolarCell): PolarPort | null => {
    const edge = commonEdge(left, right)
    if (!edge)
      return null
    if (left.ring === right.ring) {
      // This doorway lies on a radial wall. Its centerline point is shared by
      // both cells, rather than either sector's angular midpoint.
      const angle = left.clockwise === edge ? left.endAngle : left.startAngle
      return { angle, kind: 'angular', radius: midpointRadius(left) }
    }
    // A split or merge doorway is on an annular wall. The selected outer
    // sector determines its angle; this is what prevents a parent cell from
    // drawing a false spoke towards a sibling sector.
    const outer = left.ring > right.ring ? left : right
    const inner = left.ring < right.ring ? left : right
    return { angle: midpointAngle(outer), kind: 'radial', radius: inner.outerRadius }
  }
  const portPoint = (cell: PolarCell, port: PolarPort) => pointAt(cell, port.radius, port.angle)
  const throughCell = (
    cell: PolarCell,
    from: PolarPort,
    to: PolarPort,
    width: number,
    value: string,
  ) => {
    const center = centerOf(cell)
    const mid = midpointRadius(cell)
    const fromPoint = portPoint(cell, from)
    const toPoint = portPoint(cell, to)
    if (cell.ring === 0) {
      line(fromPoint, center, width, value)
      line(center, toPoint, width, value)
      return
    }
    const fromMid = pointAt(cell, mid, from.angle)
    const toMid = pointAt(cell, mid, to.angle)
    if (samePoint(fromPoint, toPoint))
      return
    if (from.kind === 'angular' && to.kind === 'angular') {
      arc(center, mid, from.angle, to.angle, width, value)
      return
    }
    if (from.kind === 'radial' && to.kind === 'radial') {
      if (!samePoint(fromPoint, fromMid))
        line(fromPoint, fromMid, width, value)
      if (Math.abs(from.angle - to.angle) > 1e-6)
        arc(center, mid, from.angle, to.angle, width, value)
      if (!samePoint(toMid, toPoint))
        line(toMid, toPoint, width, value)
      return
    }
    if (from.kind === 'angular') {
      if (Math.abs(from.angle - to.angle) > 1e-6)
        arc(center, mid, from.angle, to.angle, width, value)
      if (!samePoint(toMid, toPoint))
        line(toMid, toPoint, width, value)
      return
    }
    if (!samePoint(fromPoint, fromMid))
      line(fromPoint, fromMid, width, value)
    if (Math.abs(from.angle - to.angle) > 1e-6)
      arc(center, mid, from.angle, to.angle, width, value)
  }
  const startOrEnd = (cell: PolarCell, port: PolarPort, atStart: boolean, width: number, value: string) => {
    const mid = midpointRadius(cell)
    const centralPort: PolarPort = {
      angle: cell.ring === 0 ? port.angle : midpointAngle(cell),
      kind: 'angular',
      radius: cell.ring === 0 ? 0 : mid,
    }
    if (cell.ring === 0) {
      const center = centerOf(cell)
      line(center, portPoint(cell, port), width, value)
      return
    }
    if (atStart)
      throughCell(cell, centralPort, port, width, value)
    else throughCell(cell, port, centralPort, width, value)
  }
  for (const [index, path] of paths.entries()) {
    routeIndex = index
    // Keep exploratory trails behind the selected/active route. They may share
    // a branch point, but must never depth-fight or paint over the main path.
    pathZ = path.layer === 'subpath' ? LINE_Z - 0.001 : LINE_Z
    const pathCells = path.points.map(point => runtime.grid.getCell(`${point.y}:${point.x}`))
    if (pathCells.some(cell => !cell || !('ring' in cell)))
      continue
    const cells = pathCells as PolarCell[]
    if (cells.length < 2)
      continue
    const ports = cells.slice(0, -1).map((cell, cellIndex) => portBetween(cell, cells[cellIndex + 1]))
    if (ports.some(port => !port))
      continue
    const resolvedPorts = ports as PolarPort[]
    startOrEnd(cells[0], resolvedPorts[0], true, path.width, path.color)
    for (let cellIndex = 1; cellIndex < cells.length - 1; cellIndex += 1) {
      throughCell(cells[cellIndex], resolvedPorts[cellIndex - 1], resolvedPorts[cellIndex], path.width, path.color)
    }
    startOrEnd(cells[cells.length - 1], resolvedPorts[resolvedPorts.length - 1], false, path.width, path.color)
  }
  // Polar path joins are crisp radial/tangential square miters. They make a
  // single continuous route rather than a collection of protruding strokes.
  const origin = runtime.grid.rows
  for (const { color: value, count, point: center, width, z } of joins.values()) {
    if (count < 2)
      continue
    pathZ = z
    if (Math.hypot(center.x - origin, center.y - origin) < 1e-6)
      continue
    const angle = Math.atan2(center.y - origin, center.x - origin)
    const half = width / 2
    const radial = { x: Math.cos(angle), y: Math.sin(angle) }
    const tangent = { x: -radial.y, y: radial.x }
    const point = (r: number, t: number) => ({ x: center.x + radial.x * r + tangent.x * t, y: center.y + radial.y * r + tangent.y * t })
    const a = point(-half, -half)
    const b = point(-half, half)
    const c = point(half, half)
    const d = point(half, -half)
    triangle(a, b, c, value)
    triangle(a, c, d, value)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  return geometry
}

export interface Webgl2dOverlaySegment {
  from: MazePoint
  to: MazePoint
  color: string
  width: number
  cap?: 'butt' | 'square'
}

export interface Webgl2dPolarPath {
  points: MazePoint[]
  color: string
  width: number
  layer?: 'path' | 'subpath'
}

export interface Webgl2dOverlayDot {
  point: MazePoint
  color: string
  radius: number
}

export interface Webgl2dOverlayRing {
  point: MazePoint
  color: string
  radius: number
}

export function getOverlaySegmentRenderLength(
  segmentLength: number,
  width: number,
  cap: Webgl2dOverlaySegment['cap'] = 'square',
): number {
  return cap === 'butt' ? segmentLength : segmentLength + width
}

export interface Webgl2dViewState {
  runtime: Maze
  wallThickness: number
  wallRevision: number
  wallsVisible: boolean
  wallColor: string
  getCellColor: (x: number, y: number) => string
  gridColor: string
  gridVisible: boolean
  gridWidth: number
  cellKey: string
  segments: Webgl2dOverlaySegment[]
  polarPaths: Webgl2dPolarPath[]
  dots: Webgl2dOverlayDot[]
  rings: Webgl2dOverlayRing[]
  hintSegments: Webgl2dOverlaySegment[]
  hintBorderSegments: Webgl2dOverlaySegment[]
  hintDots: Webgl2dOverlayDot[]
  hintRings: Webgl2dOverlayRing[]
  overlayKey: string
  start: MazePoint | null
  startColor: string
  end: MazePoint | null
  endColor: string
  zoom: number
  panX: number
  panY: number
  viewportWidth: number
  viewportHeight: number
}

const GRID_Z = WALL_Z + 0.001
const DOT_Z = 0.03
const HINT_FILL_Z = 0.045
const HINT_BORDER_Z = 0.055
const START_END_POINT_Z = 0.04
const RING_Z = 0.06

export function buildTriangleWallStripPositions(
  polygon: Array<{ x: number, y: number }>,
  segment: { from: { x: number, y: number }, to: { x: number, y: number } },
  thickness: number,
): Float32Array {
  return triangulateWallPolygon(clipTriangleWallStrip(polygon, segment, thickness))
}

function clipTriangleWallStrip(
  polygon: Array<{ x: number, y: number }>,
  segment: { from: { x: number, y: number }, to: { x: number, y: number } },
  thickness: number,
): Array<{ x: number, y: number }> {
  const dx = segment.to.x - segment.from.x
  const dy = segment.to.y - segment.from.y
  const length = Math.hypot(dx, dy)
  const signedDistance = (point: { x: number, y: number }): number =>
    (dx * (point.y - segment.from.y) - dy * (point.x - segment.from.x)) / length
  let clipped = clipPolygon(polygon, point => thickness / 2 - signedDistance(point))
  clipped = clipPolygon(clipped, point => thickness / 2 + signedDistance(point))
  return clipped
}

function triangulateWallPolygon(polygon: Array<{ x: number, y: number }>): Float32Array {
  const positions: number[] = []
  for (let index = 1; index < polygon.length - 1; index += 1) {
    for (const point of [polygon[0], polygon[index], polygon[index + 1]]) {
      positions.push(point.x, -point.y, WALL_Z)
    }
  }
  return new Float32Array(positions)
}

function clipPolygon(
  polygon: Array<{ x: number, y: number }>,
  distanceInside: (point: { x: number, y: number }) => number,
): Array<{ x: number, y: number }> {
  const clipped: Array<{ x: number, y: number }> = []
  for (let index = 0; index < polygon.length; index += 1) {
    const from = polygon[index]
    const to = polygon[(index + 1) % polygon.length]
    const fromDistance = distanceInside(from)
    const toDistance = distanceInside(to)
    const fromInside = fromDistance >= -1e-9
    const toInside = toDistance >= -1e-9
    if (fromInside) {
      clipped.push(from)
    }
    if (fromInside !== toInside) {
      const ratio = fromDistance / (fromDistance - toDistance)
      clipped.push({
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      })
    }
  }
  return clipped
}

const triangleWallBuildCaches = new WeakMap<Maze, TriangleWallBuildCache>()

export function buildTriangleWallPositions(runtime: Maze, thickness: number): Float32Array {
  return concatFloat32Arrays(buildTriangleWallPositionChunks(runtime, thickness))
}

export function buildTriangleWallPositionChunks(runtime: Maze, thickness: number): Float32Array[] {
  let cache = triangleWallBuildCaches.get(runtime)
  if (!cache || cache.thickness !== thickness) {
    cache = createTriangleWallBuildCache(runtime, thickness)
    triangleWallBuildCaches.set(runtime, cache)
  }

  const chunks: Float32Array[] = []
  for (const wall of cache.walls) {
    if (!isTriangleWallOpen(wall)) {
      chunks.push(wall.positions)
    }
  }
  for (const junction of cache.junctions.values()) {
    const signature = getTriangleJunctionSignature(junction, cache)
    if (junction.signature !== signature) {
      junction.positions = buildTriangleJunctionPositions(junction, cache)
      junction.signature = signature
    }
    chunks.push(junction.positions)
  }
  return chunks
}

interface TriangleWallOwner {
  polygon: Array<{ x: number, y: number }>
  segment: { from: { x: number, y: number }, to: { x: number, y: number } }
}

interface TriangleWallBuildRecord {
  edge: MazeEdge | null
  from: { x: number, y: number }
  key: string
  owners: TriangleWallOwner[]
  positions: Float32Array
  to: { x: number, y: number }
}

interface TriangleWallJunctionIncident {
  direction: { x: number, y: number }
  oppositeKey: string
  points: Array<{ x: number, y: number }>
  wall: TriangleWallBuildRecord
}

interface TriangleWallJunction {
  incidents: TriangleWallJunctionIncident[]
  positions: Float32Array
  signature: string
  x: number
  y: number
}

interface TriangleWallBuildCache {
  junctions: Map<string, TriangleWallJunction>
  thickness: number
  wallByKey: Map<string, TriangleWallBuildRecord>
  walls: TriangleWallBuildRecord[]
}

function createTriangleWallBuildCache(runtime: Maze, thickness: number): TriangleWallBuildCache {
  const wallByKey = new Map<string, TriangleWallBuildRecord>()
  for (const cell of runtime.grid.cells) {
    const polygon = getCellPolygon(cell)
    for (const segment of getCellBoundarySegments(cell)) {
      const key = wallSegmentKey(segment)
      const wall = wallByKey.get(key) ?? {
        edge: segment.edge,
        from: segment.from,
        key,
        owners: [],
        positions: new Float32Array(),
        to: segment.to,
      }
      wall.edge ??= segment.edge
      wall.owners.push({ polygon, segment })
      wallByKey.set(key, wall)
    }
  }

  const junctions = new Map<string, TriangleWallJunction>()
  const walls = [...wallByKey.values()]
  for (const wall of walls) {
    const bodyChunks: Float32Array[] = []
    const junctionPoints = new Map<string, Array<{ x: number, y: number }>>()
    for (const owner of wall.owners) {
      const strip = clipTriangleWallStrip(owner.polygon, owner.segment, thickness)
      const jointStrip = [...strip]
      bodyChunks.push(triangulateWallPolygon(strip))
      if (wall.owners.length === 1) {
        const outerStrip = clipTriangleWallStrip(
          reflectPolygonAcrossLine(owner.polygon, owner.segment),
          owner.segment,
          thickness,
        )
        bodyChunks.push(triangulateWallPolygon(outerStrip))
        jointStrip.push(...outerStrip)
      }
      for (const endpoint of [wall.from, wall.to]) {
        const key = worldPointKey(endpoint)
        const points = junctionPoints.get(key) ?? []
        for (const point of jointStrip) {
          if (Math.hypot(point.x - endpoint.x, point.y - endpoint.y) <= thickness * 1.01) {
            points.push(point)
          }
        }
        junctionPoints.set(key, points)
      }
    }
    wall.positions = concatFloat32Arrays(bodyChunks)

    const dx = wall.to.x - wall.from.x
    const dy = wall.to.y - wall.from.y
    const length = Math.hypot(dx, dy)
    addTriangleJunctionIncident(junctions, wall.from, {
      direction: { x: dx / length, y: dy / length },
      oppositeKey: worldPointKey(wall.to),
      points: junctionPoints.get(worldPointKey(wall.from)) ?? [],
      wall,
    })
    addTriangleJunctionIncident(junctions, wall.to, {
      direction: { x: -dx / length, y: -dy / length },
      oppositeKey: worldPointKey(wall.from),
      points: junctionPoints.get(worldPointKey(wall.to)) ?? [],
      wall,
    })
  }

  return { junctions, thickness, wallByKey, walls }
}

function addTriangleJunctionIncident(
  junctions: Map<string, TriangleWallJunction>,
  point: { x: number, y: number },
  incident: TriangleWallJunctionIncident,
): void {
  const key = worldPointKey(point)
  const junction = junctions.get(key) ?? {
    incidents: [],
    positions: new Float32Array(),
    signature: '',
    x: point.x,
    y: point.y,
  }
  junction.incidents.push(incident)
  junctions.set(key, junction)
}

function isTriangleWallOpen(wall: TriangleWallBuildRecord): boolean {
  return wall.edge?.opened === true
}

function getTriangleJunctionSignature(
  junction: TriangleWallJunction,
  cache: TriangleWallBuildCache,
): string {
  const local = junction.incidents.map(incident => isTriangleWallOpen(incident.wall) ? '1' : '0').join('')
  const opposite = junction.incidents.map((incident) => {
    const oppositeJunction = cache.junctions.get(incident.oppositeKey)
    return oppositeJunction?.incidents
      .map(candidate => isTriangleWallOpen(candidate.wall) ? '1' : '0')
      .join('') ?? ''
  }).join('.')
  return `${local}|${opposite}`
}

function buildTriangleJunctionPositions(
  junction: TriangleWallJunction,
  cache: TriangleWallBuildCache,
): Float32Array {
  const closed = junction.incidents.filter(incident => !isTriangleWallOpen(incident.wall))
  if (closed.length === 0) {
    return new Float32Array()
  }

  const points = closed.flatMap(incident => incident.points)
  const directions = closed.map(incident => incident.direction)
  let pointed60DegreeMiter: { x: number, y: number } | null = null
  if (directions.length === 2) {
    const oppositeWallKey = wallSegmentKey(get60DegreeOppositeWallSegment(
      junction,
      directions[0],
      directions[1],
    ))
    const oppositeWall = cache.wallByKey.get(oppositeWallKey)
    const miter120 = get120DegreeMiterPoint(directions[0], directions[1], cache.thickness / 2)
    pointed60DegreeMiter = get60DegreeMiterPoint(
      directions[0],
      directions[1],
      cache.thickness / 2,
      oppositeWall !== undefined && !isTriangleWallOpen(oppositeWall),
    )
    if (miter120) {
      points.push({ x: junction.x + miter120.x, y: junction.y + miter120.y })
    }
  }

  const passageInset = getTrianglePassageInset(cache.thickness)
  for (const incident of junction.incidents) {
    if (isTriangleWallOpen(incident.wall)) {
      points.push({
        x: junction.x + incident.direction.x * passageInset,
        y: junction.y + incident.direction.y * passageInset,
      })
    }
  }
  let jointPolygon = convexHull(points)
  for (const incident of junction.incidents) {
    if (isTriangleWallOpen(incident.wall)) {
      jointPolygon = clipPolygon(jointPolygon, point =>
        passageInset
        - (point.x - junction.x) * incident.direction.x
        - (point.y - junction.y) * incident.direction.y)
    }
  }
  if (pointed60DegreeMiter) {
    jointPolygon = convexHull([
      ...jointPolygon,
      {
        x: junction.x + pointed60DegreeMiter.x,
        y: junction.y + pointed60DegreeMiter.y,
      },
    ])
  }
  if (directions.length === 1) {
    const wallDirection = directions[0]
    const continuation = junction.incidents.find(incident => isTriangleWallOpen(incident.wall)
      && incident.direction.x * wallDirection.x + incident.direction.y * wallDirection.y < -0.999)
    if (continuation) {
      const outward = { x: -wallDirection.x, y: -wallDirection.y }
      const normal = { x: -wallDirection.y, y: wallDirection.x }
      const oppositeJunction = cache.junctions.get(continuation.oppositeKey)
      const oppositeWalls = oppositeJunction
        ? oppositeJunction.incidents.filter(incident => !isTriangleWallOpen(incident.wall)).map(incident => incident.direction)
        : []
      const facingWalls = getFacingOppositeWalls(outward, oppositeWalls)
      const pointsAt120DegreeJoint = has120DegreeWallJoint(facingWalls)
      const terminalNormalSign = getParallelTerminalNormalSign(
        outward,
        normal,
        cache.thickness,
        facingWalls,
      )
      jointPolygon = convexHull([
        ...jointPolygon,
        getTriangleTerminalPoint(
          junction,
          outward,
          normal,
          cache.thickness,
          pointsAt120DegreeJoint,
          terminalNormalSign,
        ),
      ])
    }
  }
  return triangulateWallPolygon(jointPolygon)
}

function concatFloat32Arrays(chunks: Float32Array[]): Float32Array {
  const output = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

export function getTrianglePassageInset(thickness: number): number {
  return thickness / Math.sqrt(3)
}

export function getTriangleTerminalPoint(
  junction: { x: number, y: number },
  outward: { x: number, y: number },
  normal: { x: number, y: number },
  thickness: number,
  arrow: boolean,
  normalSign = 1,
): { x: number, y: number } {
  const inset = getTrianglePassageInset(thickness)
  return arrow
    ? {
        x: junction.x + outward.x * inset,
        y: junction.y + outward.y * inset,
      }
    : {
        x: junction.x + outward.x * inset * 1.5 + normal.x * thickness / 2 * normalSign,
        y: junction.y + outward.y * inset * 1.5 + normal.y * thickness / 2 * normalSign,
      }
}

export function getParallelTerminalNormalSign(
  outward: { x: number, y: number },
  normal: { x: number, y: number },
  thickness: number,
  oppositeWalls: Array<{ x: number, y: number }>,
): 1 | -1 {
  const inset = getTrianglePassageInset(thickness)
  const candidates = [1, -1] as const
  let bestSign: 1 | -1 = 1
  let bestAlignment = -1
  for (const sign of candidates) {
    const capX = outward.x * inset + normal.x * thickness * sign
    const capY = outward.y * inset + normal.y * thickness * sign
    const capLength = Math.hypot(capX, capY)
    for (const wall of oppositeWalls) {
      if (Math.abs(wall.x * outward.x + wall.y * outward.y) > 0.999) {
        continue
      }
      const alignment = Math.abs((capX * wall.x + capY * wall.y) / capLength)
      if (alignment > bestAlignment) {
        bestAlignment = alignment
        bestSign = sign
      }
    }
  }
  return bestSign
}

export function getFacingOppositeWalls(
  outward: { x: number, y: number },
  oppositeWalls: Array<{ x: number, y: number }>,
): Array<{ x: number, y: number }> {
  const towardTerminal = { x: -outward.x, y: -outward.y }
  const candidates = oppositeWalls.filter(wall =>
    Math.abs(wall.x * outward.x + wall.y * outward.y) < 0.999)
  if (candidates.length <= 1) {
    return candidates
  }
  const scores = candidates.map(wall =>
    wall.x * towardTerminal.x + wall.y * towardTerminal.y)
  const bestScore = Math.max(...scores)
  return candidates.filter((_, index) => Math.abs(scores[index] - bestScore) < 1e-5)
}

export function has120DegreeWallJoint(walls: Array<{ x: number, y: number }>): boolean {
  for (let leftIndex = 0; leftIndex < walls.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < walls.length; rightIndex += 1) {
      const left = walls[leftIndex]
      const right = walls[rightIndex]
      const dot = left.x * right.x + left.y * right.y
      if (Math.abs(dot + 0.5) > 1e-5) {
        continue
      }
      return true
    }
  }
  return false
}

function reflectPolygonAcrossLine(
  polygon: Array<{ x: number, y: number }>,
  segment: { from: { x: number, y: number }, to: { x: number, y: number } },
): Array<{ x: number, y: number }> {
  const dx = segment.to.x - segment.from.x
  const dy = segment.to.y - segment.from.y
  const lengthSquared = dx * dx + dy * dy
  return polygon.map((point) => {
    const projection = ((point.x - segment.from.x) * dx + (point.y - segment.from.y) * dy) / lengthSquared
    const projectedX = segment.from.x + projection * dx
    const projectedY = segment.from.y + projection * dy
    return {
      x: projectedX * 2 - point.x,
      y: projectedY * 2 - point.y,
    }
  })
}

export function get120DegreeMiterPoint(
  first: { x: number, y: number },
  second: { x: number, y: number },
  radius: number,
): { x: number, y: number } | null {
  return getAngleMiterPoint(first, second, radius, -0.5)
}

export function get60DegreeMiterPoint(
  first: { x: number, y: number },
  second: { x: number, y: number },
  radius: number,
  hasParallelOppositeWall: boolean,
): { x: number, y: number } | null {
  return hasParallelOppositeWall
    ? null
    : getAngleMiterPoint(first, second, radius, 0.5)
}

export function get60DegreeOppositeWallSegment(
  junction: { x: number, y: number },
  first: { x: number, y: number },
  second: { x: number, y: number },
): { from: { x: number, y: number }, to: { x: number, y: number } } {
  return {
    from: { x: junction.x - first.x, y: junction.y - first.y },
    to: { x: junction.x - second.x, y: junction.y - second.y },
  }
}

function getAngleMiterPoint(
  first: { x: number, y: number },
  second: { x: number, y: number },
  radius: number,
  expectedDot: number,
): { x: number, y: number } | null {
  const dot = first.x * second.x + first.y * second.y
  if (Math.abs(dot - expectedDot) > 1e-5) {
    return null
  }
  let left = first
  let right = second
  let cross = left.x * right.y - left.y * right.x
  if (cross < 0) {
    left = second
    right = first
    cross = -cross
  }
  const leftOuterNormal = { x: left.y, y: -left.x }
  const rightOuterNormal = { x: -right.y, y: right.x }
  const determinant = -cross
  return {
    x: (radius * rightOuterNormal.y - leftOuterNormal.y * radius) / determinant,
    y: (leftOuterNormal.x * radius - radius * rightOuterNormal.x) / determinant,
  }
}

function convexHull(points: Array<{ x: number, y: number }>): Array<{ x: number, y: number }> {
  const unique = [...new Map(points.map(point => [worldPointKey(point), point])).values()]
    .sort((left, right) => left.x - right.x || left.y - right.y)
  if (unique.length <= 2) {
    return unique
  }
  const cross = (origin: { x: number, y: number }, left: { x: number, y: number }, right: { x: number, y: number }): number =>
    (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x)
  const lower: Array<{ x: number, y: number }> = []
  const upper: Array<{ x: number, y: number }> = []
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) {
      lower.pop()
    }
    lower.push(point)
  }
  for (const point of [...unique].reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) {
      upper.pop()
    }
    upper.push(point)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

function worldPointKey(point: { x: number, y: number }): string {
  return `${point.x.toFixed(6)},${point.y.toFixed(6)}`
}

function wallSegmentKey(segment: { from: { x: number, y: number }, to: { x: number, y: number } }): string {
  const fromKey = worldPointKey(segment.from)
  const toKey = worldPointKey(segment.to)
  return fromKey < toKey ? `${fromKey}>${toKey}` : `${toKey}>${fromKey}`
}

export class Webgl2dMazeView {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  private readonly mazeGroup = new THREE.Group()
  private readonly container: HTMLElement
  private readonly quadGeometry = new THREE.PlaneGeometry(1, 1)
  private readonly triangleGeometry = createTriangleGeometry()
  private readonly hexGeometry = createHexGeometry()
  private readonly discGeometry = new THREE.CircleGeometry(1, 24)
  private readonly ringGeometry = new THREE.RingGeometry(0.86, 1, 32)
  private readonly cellMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly circularCellMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: true })
  private readonly gridMaterial = new THREE.MeshBasicMaterial({
    depthWrite: false,
    opacity: 0.58,
    side: THREE.DoubleSide,
    transparent: true,
  })

  private readonly wallMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly overlayLineMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly circularPathMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: true })
  private readonly overlayDotMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly overlayRingMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly hintLineMaterial = new THREE.MeshBasicMaterial({ opacity: 0.28, side: THREE.DoubleSide, transparent: true })
  private readonly hintBorderMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly hintDotMaterial = new THREE.MeshBasicMaterial({ opacity: 0.28, side: THREE.DoubleSide, transparent: true })
  private readonly hintRingMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly startMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly endMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly triangleWallMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.wallMaterial)
  private readonly circularWallMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.wallMaterial)

  private cellMesh: THREE.InstancedMesh | null = null
  private circularCellMesh: THREE.Mesh<CircularCellGeometry> | null = null
  private gridMesh: THREE.Mesh | null = null
  private gridRuntime: Maze | null = null
  private gridWidth = 0
  private wallMesh: THREE.InstancedMesh | null = null
  private overlayLineMesh: THREE.InstancedMesh | null = null
  private readonly circularPathMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.circularPathMaterial)
  private overlayDotMesh: THREE.InstancedMesh | null = null
  private overlayRingMesh: THREE.InstancedMesh | null = null
  private hintLineMesh: THREE.InstancedMesh | null = null
  private hintBorderMesh: THREE.InstancedMesh | null = null
  private hintDotMesh: THREE.InstancedMesh | null = null
  private hintRingMesh: THREE.InstancedMesh | null = null
  private readonly startMesh = new THREE.Mesh(this.discGeometry, this.startMaterial)
  private readonly endMesh = new THREE.Mesh(this.discGeometry, this.endMaterial)
  private cellRuntime: Maze | null = null
  private wallRuntime: Maze | null = null
  private lastWallKey = ''
  private circularCellRuntime: Maze | null = null
  private lastCellKey = ''
  private overlayRuntime: Maze | null = null
  private lastOverlayKey = ''
  private cellGridType = ''
  private visible = false

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
    this.renderer.setPixelRatio(getViewportPixelRatio())
    this.renderer.domElement.classList.add('three-canvas')
    this.renderer.domElement.style.display = 'none'
    container.appendChild(this.renderer.domElement)

    this.camera.position.set(0, 0, 1)
    this.camera.lookAt(0, 0, 0)
    this.scene.add(this.mazeGroup)
    this.triangleWallMesh.frustumCulled = false
    this.mazeGroup.add(this.triangleWallMesh, this.circularWallMesh, this.circularPathMesh, this.startMesh, this.endMesh)
    this.resize()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.renderer.domElement.style.display = visible ? 'block' : 'none'
    if (visible) {
      this.resize()
      this.renderFrame()
    }
  }

  resize(): void {
    const rect = this.container.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    if (width <= 0 || height <= 0) {
      return
    }
    this.renderer.setPixelRatio(getViewportPixelRatio())
    this.renderer.setSize(width, height, true)
    this.renderFrame()
  }

  getCaptureSize(): { height: number, width: number } {
    return {
      height: this.renderer.domElement.height,
      width: this.renderer.domElement.width,
    }
  }

  captureTo(context: CanvasRenderingContext2D): void {
    this.renderer.render(this.scene, this.camera)
    context.drawImage(this.renderer.domElement, 0, 0)
  }

  sync(state: Webgl2dViewState): void {
    const cells = state.runtime.grid.type === 'circular' ? 1 : state.runtime.grid.cells.length
    this.ensureCellMesh(cells, state.runtime.grid.type)
    this.ensureWallMesh(cells * 6)
    this.syncCamera(state)
    this.syncCellsIfNeeded(state)
    this.syncGrid(state)
    this.syncWallsIfNeeded(state)
    this.syncMarkers(state)
    this.syncOverlaysIfNeeded(state)
    this.renderFrame()
  }

  private syncCamera(state: Webgl2dViewState): void {
    const bounds = getGridBounds(state.runtime)
    const worldWidth = state.viewportWidth / state.zoom
    const worldHeight = state.viewportHeight / state.zoom
    const mazePixelWidth = bounds.width * FIXED_CELL_SIZE
    const mazePixelHeight = bounds.height * FIXED_CELL_SIZE
    const offsetX = (state.viewportWidth - mazePixelWidth) / 2
    const offsetY = (state.viewportHeight - mazePixelHeight) / 2
    const worldWidthCells = worldWidth / FIXED_CELL_SIZE
    const worldHeightCells = worldHeight / FIXED_CELL_SIZE
    const left = ((0 - state.panX) / state.zoom - offsetX) / FIXED_CELL_SIZE
    const top = ((0 - state.panY) / state.zoom - offsetY) / FIXED_CELL_SIZE
    const centerX = left + worldWidthCells / 2
    const centerY = -top - worldHeightCells / 2

    this.camera.left = -worldWidthCells / 2
    this.camera.right = worldWidthCells / 2
    this.camera.top = worldHeightCells / 2
    this.camera.bottom = -worldHeightCells / 2
    this.camera.position.set(centerX, centerY, 1)
    this.camera.updateProjectionMatrix()
  }

  private ensureCellMesh(capacity: number, gridType: string): void {
    if (this.cellMesh && this.cellMesh.instanceMatrix.count >= capacity && this.cellGridType === gridType) {
      return
    }
    if (this.cellMesh) {
      this.mazeGroup.remove(this.cellMesh)
      this.cellMesh.dispose()
    }
    const geometry = gridType === 'triangle'
      ? this.triangleGeometry
      : gridType === 'hexagon'
        ? this.hexGeometry
        : this.quadGeometry
    this.cellMesh = new THREE.InstancedMesh(geometry, this.cellMaterial, capacity)
    this.cellMesh.frustumCulled = false
    this.mazeGroup.add(this.cellMesh)
    this.lastCellKey = ''
    this.cellGridType = gridType
  }

  private ensureWallMesh(capacity: number): void {
    if (this.wallMesh && this.wallMesh.instanceMatrix.count >= capacity) {
      return
    }
    if (this.wallMesh) {
      this.mazeGroup.remove(this.wallMesh)
      this.wallMesh.dispose()
    }
    this.wallMesh = new THREE.InstancedMesh(this.quadGeometry, this.wallMaterial, capacity)
    this.wallMesh.frustumCulled = false
    this.mazeGroup.add(this.wallMesh)
    this.lastWallKey = ''
  }

  private syncGrid(state: Webgl2dViewState): void {
    if (this.gridRuntime !== state.runtime || this.gridWidth !== state.gridWidth) {
      if (this.gridMesh) {
        this.mazeGroup.remove(this.gridMesh)
        this.gridMesh.geometry.dispose()
      }

      const positions = new Float32Array(countGridLines(state.runtime) * 18)
      let offset = 0
      visitReferenceGridLines(state.runtime, (fromX, fromY, toX, toY) => {
        const startY = -fromY
        const endY = -toY
        const dx = toX - fromX
        const dy = endY - startY
        const length = Math.hypot(dx, dy)
        const nx = (-dy / length) * state.gridWidth / 2
        const ny = (dx / length) * state.gridWidth / 2
        const vertices = [
          fromX + nx,
          startY + ny,
          fromX - nx,
          startY - ny,
          toX + nx,
          endY + ny,
          fromX - nx,
          startY - ny,
          toX - nx,
          endY - ny,
          toX + nx,
          endY + ny,
        ]
        for (let index = 0; index < vertices.length; index += 2) {
          positions[offset++] = vertices[index]
          positions[offset++] = vertices[index + 1]
          positions[offset++] = GRID_Z
        }
      })
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      this.gridMesh = new THREE.Mesh(geometry, this.gridMaterial)
      this.gridMesh.frustumCulled = false
      this.gridMesh.renderOrder = 1
      this.mazeGroup.add(this.gridMesh)
      this.gridRuntime = state.runtime
      this.gridWidth = state.gridWidth
    }

    if (this.gridMesh) {
      this.gridMesh.visible = state.gridVisible
      this.gridMaterial.color.set(state.gridColor)
    }
  }

  private syncCellsIfNeeded(state: Webgl2dViewState): void {
    if (this.cellRuntime === state.runtime && this.lastCellKey === state.cellKey) {
      return
    }
    this.cellRuntime = state.runtime
    this.lastCellKey = state.cellKey

    if (state.runtime.grid.type === 'circular') {
      this.cellMesh!.visible = false
      if (!this.circularCellMesh || this.circularCellRuntime !== state.runtime) {
        if (this.circularCellMesh) {
          this.mazeGroup.remove(this.circularCellMesh)
          this.circularCellMesh.geometry.dispose()
        }
        this.circularCellMesh = new THREE.Mesh(
          new CircularCellGeometry(state.runtime.grid.cells, 'xy'),
          this.circularCellMaterial,
        )
        this.circularCellMesh.frustumCulled = false
        this.mazeGroup.add(this.circularCellMesh)
        this.circularCellRuntime = state.runtime
      }
      this.circularCellMesh.visible = true
      this.circularCellMesh.geometry.updateColors(state.getCellColor)
      return
    }
    if (this.circularCellMesh)
      this.circularCellMesh.visible = false
    this.cellMesh!.visible = true

    const mesh = this.cellMesh!
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    let index = 0
    for (const cell of state.runtime.grid.cells) {
      const center = getCellCenter(cell)
      if (cell instanceof TriangleCell && cell.orientation === 'down') {
        matrix.makeRotationZ(Math.PI)
      }
      else if (cell instanceof HexCell && cell.orientation === 'flat') {
        matrix.makeRotationZ(Math.PI / 2)
      }
      else {
        matrix.identity()
      }
      matrix.setPosition(center.x, -center.y, CELL_Z)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.set(state.getCellColor(cell.col, cell.row)))
      index += 1
    }
    mesh.count = index
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }

  private syncWallsIfNeeded(state: Webgl2dViewState): void {
    this.wallMaterial.color.set(state.wallColor)
    const runtimeState = state.runtime.getState()
    const wallKey = [
      runtimeState.phase,
      runtimeState.phase === 'generate' ? runtimeState.index : '',
      runtimeState.phase === 'generate' ? runtimeState.done : '',
      state.wallThickness,
      state.wallRevision,
      state.wallsVisible,
      state.runtime.grid.rows,
      state.runtime.grid.cols,
    ].join('|')
    if (this.wallRuntime === state.runtime && this.lastWallKey === wallKey) {
      return
    }
    this.wallRuntime = state.runtime
    this.lastWallKey = wallKey

    const mesh = this.wallMesh!
    if (!state.wallsVisible) {
      mesh.count = 0
      this.triangleWallMesh.visible = false
      this.circularWallMesh.visible = false
      this.lastWallKey = wallKey
      return
    }
    const matrix = new THREE.Matrix4()
    const thickness = state.wallThickness
    let index = 0
    const addWall = (fromX: number, fromY: number, toX: number, toY: number): void => {
      const dx = toX - fromX
      const dy = -(toY - fromY)
      const length = Math.hypot(dx, dy)
      matrix.makeRotationZ(Math.atan2(dy, dx))
      // Closed-wall segments overlap by one wall width. This is the same
      // coverage a round stroke gets at a join and prevents sub-pixel gaps at
      // polar arc/radial junctions without using pointed miter patches.
      matrix.scale(new THREE.Vector3(length + thickness, thickness, 1))
      matrix.setPosition((fromX + toX) / 2, -(fromY + toY) / 2, WALL_Z)
      mesh.setMatrixAt(index, matrix)
      index += 1
    }

    if (state.runtime.grid.type === 'triangle' || state.runtime.grid.type === 'hexagon') {
      mesh.count = 0
    }
    else if (state.runtime.grid.type !== 'circular') {
      visitClosedWalls(state.runtime, segment =>
        addWall(segment.from.x, segment.from.y, segment.to.x, segment.to.y))
      mesh.count = index
    }
    else {
      mesh.count = 0
    }

    const circularWallMesh = this.circularWallMesh
    if (circularWallMesh) {
      circularWallMesh.visible = state.runtime.grid.type === 'circular'
      if (circularWallMesh.visible) {
        const geometry = circularWallMesh.geometry
        if (geometry instanceof CircularWallGeometry && geometry.runtime === state.runtime && geometry.thickness === thickness) {
          geometry.syncVisibility()
        }
        else {
          geometry.dispose()
          circularWallMesh.geometry = buildCircularWallGeometry(state.runtime, thickness)
        }
      }
    }

    this.triangleWallMesh.geometry.dispose()
    this.triangleWallMesh.geometry = new THREE.BufferGeometry()
    this.triangleWallMesh.geometry.setAttribute('position', new THREE.BufferAttribute(
      state.runtime.grid.type === 'triangle' || state.runtime.grid.type === 'hexagon'
        ? buildTriangleWallPositions(state.runtime, thickness)
        : new Float32Array(),
      3,
    ))
    this.triangleWallMesh.visible = state.runtime.grid.type === 'triangle' || state.runtime.grid.type === 'hexagon'
    mesh.instanceMatrix.needsUpdate = true
  }

  private syncMarkers(state: Webgl2dViewState): void {
    const markerScale = 0.25 * getOverlayScale(state.runtime)
    this.startMesh.visible = state.start !== null
    if (state.start) {
      const center = getPointCenter(state.runtime, state.start)
      this.startMesh.position.set(center.x, -center.y, START_END_POINT_Z)
      this.startMesh.scale.setScalar(markerScale)
      this.startMaterial.color.set(state.startColor)
    }

    this.endMesh.visible = state.end !== null
    if (state.end) {
      const center = getPointCenter(state.runtime, state.end)
      this.endMesh.position.set(center.x, -center.y, START_END_POINT_Z)
      this.endMesh.scale.setScalar(markerScale)
      this.endMaterial.color.set(state.endColor)
    }
  }

  private syncOverlaysIfNeeded(state: Webgl2dViewState): void {
    if (this.overlayRuntime === state.runtime && this.lastOverlayKey === state.overlayKey) {
      return
    }
    this.overlayRuntime = state.runtime
    this.lastOverlayKey = state.overlayKey

    this.ensureOverlayMeshes(state)
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()

    const lineMesh = this.overlayLineMesh
    if (lineMesh) {
      let index = 0
      // Ordered solver/generation routes are removed from `segments` upstream
      // and drawn by circularPathMesh. Keep the remaining independent overlay
      // segments (frontiers, edit hints, Kruskal edges) visible in circular mode.
      for (const segment of state.segments) {
        const from = getPointCenter(state.runtime, segment.from)
        const to = getPointCenter(state.runtime, segment.to)
        const dx = to.x - from.x
        const dy = -(to.y - from.y)
        const centerX = (from.x + to.x) / 2
        const centerY = -(from.y + to.y) / 2
        matrix.makeRotationZ(Math.atan2(dy, dx))
        matrix.scale(new THREE.Vector3(
          getOverlaySegmentRenderLength(Math.hypot(dx, dy), segment.width, segment.cap),
          segment.width,
          1,
        ))
        matrix.setPosition(centerX, centerY, LINE_Z)
        lineMesh.setMatrixAt(index, matrix)
        lineMesh.setColorAt(index, color.set(segment.color))
        index += 1
      }
      lineMesh.count = index
      lineMesh.instanceMatrix.needsUpdate = true
      if (lineMesh.instanceColor) {
        lineMesh.instanceColor.needsUpdate = true
      }
    }
    this.circularPathMesh.visible = state.runtime.grid.type === 'circular'
    if (this.circularPathMesh.visible) {
      this.circularPathMesh.geometry.dispose()
      this.circularPathMesh.geometry = buildCircularPathGeometry(state.runtime, state.polarPaths)
    }

    const dotMesh = this.overlayDotMesh
    if (dotMesh) {
      let index = 0
      for (const dot of state.dots) {
        const center = getPointCenter(state.runtime, dot.point)
        matrix.makeScale(dot.radius, dot.radius, 1)
        matrix.setPosition(center.x, -center.y, DOT_Z)
        dotMesh.setMatrixAt(index, matrix)
        dotMesh.setColorAt(index, color.set(dot.color))
        index += 1
      }
      // Square-grid overlays deliberately use square caps. Polar paths turn at
      // arbitrary angles, so cover every segment endpoint with a disc to make
      // joins and caps visually round rather than pointed.
      dotMesh.count = index
      dotMesh.instanceMatrix.needsUpdate = true
      if (dotMesh.instanceColor) {
        dotMesh.instanceColor.needsUpdate = true
      }
    }

    const ringMesh = this.overlayRingMesh
    if (ringMesh) {
      let index = 0
      for (const ring of state.rings) {
        const center = getPointCenter(state.runtime, ring.point)
        matrix.makeScale(ring.radius, ring.radius, 1)
        matrix.setPosition(center.x, -center.y, RING_Z)
        ringMesh.setMatrixAt(index, matrix)
        ringMesh.setColorAt(index, color.set(ring.color))
        index += 1
      }
      ringMesh.count = index
      ringMesh.instanceMatrix.needsUpdate = true
      if (ringMesh.instanceColor) {
        ringMesh.instanceColor.needsUpdate = true
      }
    }

    this.syncHintSegments(state.hintSegments, this.hintLineMesh, HINT_FILL_Z)
    this.syncHintSegments(state.hintBorderSegments, this.hintBorderMesh, HINT_BORDER_Z)
    this.syncHintDots(state.runtime, state.hintDots, this.hintDotMesh, HINT_FILL_Z)
    this.syncHintRings(state.runtime, state.hintRings, this.hintRingMesh)
  }

  private syncHintSegments(segments: Webgl2dOverlaySegment[], mesh: THREE.InstancedMesh | null, z: number): void {
    if (!mesh) {
      return
    }

    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    let index = 0
    for (const segment of segments) {
      const dx = segment.to.x - segment.from.x
      const dy = -(segment.to.y - segment.from.y)
      const centerX = (segment.from.x + segment.to.x) / 2
      const centerY = -(segment.from.y + segment.to.y) / 2
      matrix.makeRotationZ(Math.atan2(dy, dx))
      matrix.scale(new THREE.Vector3(Math.hypot(dx, dy) + segment.width, segment.width, 1))
      matrix.setPosition(centerX, centerY, z)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.set(segment.color))
      index += 1
    }
    mesh.count = index
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }

  private syncHintDots(runtime: Maze, dots: Webgl2dOverlayDot[], mesh: THREE.InstancedMesh | null, z: number): void {
    if (!mesh) {
      return
    }

    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    let index = 0
    for (const dot of dots) {
      const center = getPointCenter(runtime, dot.point)
      matrix.makeScale(dot.radius, dot.radius, 1)
      matrix.setPosition(center.x, -center.y, z)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.set(dot.color))
      index += 1
    }
    mesh.count = index
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }

  private syncHintRings(runtime: Maze, rings: Webgl2dOverlayRing[], mesh: THREE.InstancedMesh | null): void {
    if (!mesh) {
      return
    }

    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    let index = 0
    for (const ring of rings) {
      const center = getPointCenter(runtime, ring.point)
      matrix.makeScale(ring.radius, ring.radius, 1)
      matrix.setPosition(center.x, -center.y, RING_Z)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.set(ring.color))
      index += 1
    }
    mesh.count = index
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }

  private ensureOverlayMeshes(state: Webgl2dViewState): void {
    const lineCapacity = state.segments.length
    const dotCapacity = state.dots.length
    const ringCapacity = state.rings.length
    const hintLineCapacity = state.hintSegments.length
    const hintBorderCapacity = state.hintBorderSegments.length
    const hintDotCapacity = state.hintDots.length
    const hintRingCapacity = state.hintRings.length

    if (lineCapacity > 0 && (!this.overlayLineMesh || this.overlayLineMesh.instanceMatrix.count < lineCapacity)) {
      if (this.overlayLineMesh) {
        this.mazeGroup.remove(this.overlayLineMesh)
        this.overlayLineMesh.dispose()
      }
      this.overlayLineMesh = new THREE.InstancedMesh(this.quadGeometry, this.overlayLineMaterial, Math.ceil(lineCapacity * 1.5))
      this.overlayLineMesh.frustumCulled = false
      this.mazeGroup.add(this.overlayLineMesh)
      this.lastOverlayKey = ''
    }
    if (this.overlayLineMesh && lineCapacity === 0) {
      this.overlayLineMesh.count = 0
    }

    if (dotCapacity > 0 && (!this.overlayDotMesh || this.overlayDotMesh.instanceMatrix.count < dotCapacity)) {
      if (this.overlayDotMesh) {
        this.mazeGroup.remove(this.overlayDotMesh)
        this.overlayDotMesh.dispose()
      }
      this.overlayDotMesh = new THREE.InstancedMesh(this.discGeometry, this.overlayDotMaterial, Math.ceil(dotCapacity * 1.5))
      this.overlayDotMesh.frustumCulled = false
      this.mazeGroup.add(this.overlayDotMesh)
      this.lastOverlayKey = ''
    }
    if (this.overlayDotMesh && dotCapacity === 0) {
      this.overlayDotMesh.count = 0
    }

    if (ringCapacity > 0 && (!this.overlayRingMesh || this.overlayRingMesh.instanceMatrix.count < ringCapacity)) {
      if (this.overlayRingMesh) {
        this.mazeGroup.remove(this.overlayRingMesh)
        this.overlayRingMesh.dispose()
      }
      this.overlayRingMesh = new THREE.InstancedMesh(this.ringGeometry, this.overlayRingMaterial, Math.ceil(ringCapacity * 1.5))
      this.overlayRingMesh.frustumCulled = false
      this.mazeGroup.add(this.overlayRingMesh)
      this.lastOverlayKey = ''
    }
    if (this.overlayRingMesh && ringCapacity === 0) {
      this.overlayRingMesh.count = 0
    }

    this.hintLineMesh = this.ensureHintMesh(
      this.hintLineMesh,
      hintLineCapacity,
      this.quadGeometry,
      this.hintLineMaterial,
    )
    this.hintBorderMesh = this.ensureHintMesh(
      this.hintBorderMesh,
      hintBorderCapacity,
      this.quadGeometry,
      this.hintBorderMaterial,
    )
    this.hintDotMesh = this.ensureHintMesh(
      this.hintDotMesh,
      hintDotCapacity,
      this.discGeometry,
      this.hintDotMaterial,
    )
    this.hintRingMesh = this.ensureHintMesh(
      this.hintRingMesh,
      hintRingCapacity,
      this.ringGeometry,
      this.hintRingMaterial,
    )
  }

  private ensureHintMesh(
    current: THREE.InstancedMesh | null,
    capacity: number,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
  ): THREE.InstancedMesh | null {
    if (capacity === 0) {
      if (current) {
        current.count = 0
      }
      return current
    }

    if (current && current.instanceMatrix.count >= capacity) {
      return current
    }

    if (current) {
      this.mazeGroup.remove(current)
      current.dispose()
    }

    const mesh = new THREE.InstancedMesh(geometry, material, Math.ceil(capacity * 1.5))
    mesh.frustumCulled = false
    this.mazeGroup.add(mesh)
    this.lastOverlayKey = ''
    return mesh
  }

  private renderFrame(): void {
    if (!this.visible) {
      return
    }
    this.renderer.render(this.scene, this.camera)
  }
}
