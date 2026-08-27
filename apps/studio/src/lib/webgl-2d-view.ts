import type { Maze } from 'mazely'
import type { MazePoint } from './maze-types'
import * as THREE from 'three'
import {
  getCellBoundarySegments,
  getCellCenter,
  getCellPolygon,
  getGridBounds,
  getOverlayScale,
  getPointCenter,
  TRIANGLE_HEIGHT,
  visitClosedWalls,
} from './grid-geometry'
import { countGridLines, visitReferenceGridLines } from './runtime'
import { FIXED_CELL_SIZE } from './types'
import { getViewportPixelRatio } from './utils'

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

export interface Webgl2dOverlaySegment {
  from: MazePoint
  to: MazePoint
  color: string
  width: number
  cap?: 'butt' | 'square'
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

const CELL_Z = 0
const WALL_Z = 0.01
const GRID_Z = WALL_Z + 0.001
const LINE_Z = 0.02
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

function buildTriangleWallPositions(runtime: Maze, thickness: number): Float32Array {
  const positions: number[] = []
  const closedWallKeys = new Set<string>()
  const wallCounts = new Map<string, number>()
  const gridJunctions = new Map<string, Map<string, {
    direction: { x: number, y: number }
    opened: boolean
    oppositeKey: string
  }>>()
  const addGridEdge = (
    endpoint: { x: number, y: number },
    opposite: { x: number, y: number },
    wallKey: string,
    direction: { x: number, y: number },
    opened: boolean,
  ): void => {
    const key = worldPointKey(endpoint)
    const edges = gridJunctions.get(key) ?? new Map()
    const existing = edges.get(wallKey)
    edges.set(wallKey, {
      direction,
      opened: existing?.opened === true || opened,
      oppositeKey: worldPointKey(opposite),
    })
    gridJunctions.set(key, edges)
  }
  for (const cell of runtime.grid.cells) {
    for (const segment of getCellBoundarySegments(cell)) {
      const wallKey = wallSegmentKey(segment)
      wallCounts.set(wallKey, (wallCounts.get(wallKey) ?? 0) + 1)
      if (!segment.opened) {
        closedWallKeys.add(wallKey)
      }
      const dx = segment.to.x - segment.from.x
      const dy = segment.to.y - segment.from.y
      const length = Math.hypot(dx, dy)
      addGridEdge(segment.from, segment.to, wallKey, { x: dx / length, y: dy / length }, segment.opened)
      addGridEdge(segment.to, segment.from, wallKey, { x: -dx / length, y: -dy / length }, segment.opened)
    }
  }
  const junctions = new Map<string, {
    points: Array<{ x: number, y: number }>
    walls: Map<string, { x: number, y: number }>
    x: number
    y: number
  }>()
  const addJunctionPoints = (
    endpoint: { x: number, y: number },
    wallKey: string,
    direction: { x: number, y: number },
    polygon: Array<{ x: number, y: number }>,
  ): void => {
    const key = worldPointKey(endpoint)
    const junction = junctions.get(key) ?? {
      points: [],
      walls: new Map<string, { x: number, y: number }>(),
      x: endpoint.x,
      y: endpoint.y,
    }
    junction.walls.set(wallKey, direction)
    for (const point of polygon) {
      if (Math.hypot(point.x - endpoint.x, point.y - endpoint.y) <= thickness * 1.01) {
        junction.points.push(point)
      }
    }
    junctions.set(key, junction)
  }
  for (const cell of runtime.grid.cells) {
    const polygon = getCellPolygon(cell)
    for (const segment of getCellBoundarySegments(cell)) {
      if (!segment.opened) {
        const strip = clipTriangleWallStrip(polygon, segment, thickness)
        positions.push(...triangulateWallPolygon(strip))
        const wallKey = wallSegmentKey(segment)
        const junctionStrip = [...strip]
        const boundary = wallCounts.get(wallKey) === 1
        if (boundary) {
          const outerStrip = clipTriangleWallStrip(reflectPolygonAcrossLine(polygon, segment), segment, thickness)
          positions.push(...triangulateWallPolygon(outerStrip))
          junctionStrip.push(...outerStrip)
        }
        const dx = segment.to.x - segment.from.x
        const dy = segment.to.y - segment.from.y
        const length = Math.hypot(dx, dy)
        addJunctionPoints(segment.from, wallKey, { x: dx / length, y: dy / length }, junctionStrip)
        addJunctionPoints(segment.to, wallKey, { x: -dx / length, y: -dy / length }, junctionStrip)
      }
    }
  }
  for (const junction of junctions.values()) {
    if (junction.walls.size >= 1) {
      const points = [...junction.points]
      const directions = [...junction.walls.values()]
      let pointed60DegreeMiter: { x: number, y: number } | null = null
      if (directions.length === 2) {
        const oppositeWallKey = wallSegmentKey(get60DegreeOppositeWallSegment(
          junction,
          directions[0],
          directions[1],
        ))
        const miter120 = get120DegreeMiterPoint(directions[0], directions[1], thickness / 2)
        pointed60DegreeMiter = get60DegreeMiterPoint(
          directions[0],
          directions[1],
          thickness / 2,
          closedWallKeys.has(oppositeWallKey),
        )
        if (miter120) {
          points.push({ x: junction.x + miter120.x, y: junction.y + miter120.y })
        }
      }
      const passageInset = getTrianglePassageInset(thickness)
      const gridEdges = [...(gridJunctions.get(worldPointKey(junction))?.values() ?? [])]
      for (const edge of gridEdges) {
        if (edge.opened) {
          points.push({
            x: junction.x + edge.direction.x * passageInset,
            y: junction.y + edge.direction.y * passageInset,
          })
        }
      }
      let jointPolygon = convexHull(points)
      for (const edge of gridEdges) {
        if (edge.opened) {
          jointPolygon = clipPolygon(jointPolygon, point =>
            passageInset
            - (point.x - junction.x) * edge.direction.x
            - (point.y - junction.y) * edge.direction.y)
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
        const continuation = gridEdges.find(edge => edge.opened
          && edge.direction.x * wallDirection.x + edge.direction.y * wallDirection.y < -0.999)
        if (continuation) {
          const outward = { x: -wallDirection.x, y: -wallDirection.y }
          const normal = { x: -wallDirection.y, y: wallDirection.x }
          const oppositeWalls = [...(junctions.get(continuation.oppositeKey)?.walls.values() ?? [])]
          const facingWalls = getFacingOppositeWalls(outward, oppositeWalls)
          const pointsAt120DegreeJoint = has120DegreeWallJoint(facingWalls)
          const terminalNormalSign = getParallelTerminalNormalSign(outward, normal, thickness, facingWalls)
          jointPolygon = convexHull([
            ...jointPolygon,
            getTriangleTerminalPoint(
              junction,
              outward,
              normal,
              thickness,
              pointsAt120DegreeJoint,
              terminalNormalSign,
            ),
          ])
        }
      }
      positions.push(...triangulateWallPolygon(jointPolygon))
    }
  }
  return new Float32Array(positions)
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
  private readonly discGeometry = new THREE.CircleGeometry(1, 24)
  private readonly ringGeometry = new THREE.RingGeometry(0.86, 1, 32)
  private readonly cellMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly gridMaterial = new THREE.MeshBasicMaterial({
    depthWrite: false,
    opacity: 0.58,
    side: THREE.DoubleSide,
    transparent: true,
  })

  private readonly wallMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly overlayLineMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly overlayDotMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly overlayRingMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly hintLineMaterial = new THREE.MeshBasicMaterial({ opacity: 0.28, side: THREE.DoubleSide, transparent: true })
  private readonly hintBorderMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly hintDotMaterial = new THREE.MeshBasicMaterial({ opacity: 0.28, side: THREE.DoubleSide, transparent: true })
  private readonly hintRingMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly startMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly endMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly triangleWallMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.wallMaterial)

  private cellMesh: THREE.InstancedMesh | null = null
  private gridMesh: THREE.Mesh | null = null
  private gridRuntime: Maze | null = null
  private gridWidth = 0
  private wallMesh: THREE.InstancedMesh | null = null
  private overlayLineMesh: THREE.InstancedMesh | null = null
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
  private lastCellKey = ''
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
    this.mazeGroup.add(this.triangleWallMesh, this.startMesh, this.endMesh)
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
    this.ensureCellMesh(state.runtime.grid.cells.length, state.runtime.grid.type)
    this.ensureWallMesh(state.runtime.grid.cells.length * 4)
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
    const geometry = gridType === 'triangle' ? this.triangleGeometry : this.quadGeometry
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

    const mesh = this.cellMesh!
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    let index = 0
    for (const cell of state.runtime.grid.cells) {
      const center = getCellCenter(cell)
      if ('orientation' in cell && cell.orientation === 'down') {
        matrix.makeRotationZ(Math.PI)
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
    const runtimeState = state.runtime.getState()
    const wallKey = [
      runtimeState.phase,
      runtimeState.index,
      runtimeState.done,
      state.wallThickness,
      state.wallColor,
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
      matrix.scale(new THREE.Vector3(length + thickness, thickness, 1))
      matrix.setPosition((fromX + toX) / 2, -(fromY + toY) / 2, WALL_Z)
      mesh.setMatrixAt(index, matrix)
      index += 1
    }

    if (state.runtime.grid.type === 'triangle') {
      mesh.count = 0
    }
    else {
      visitClosedWalls(state.runtime, segment =>
        addWall(segment.from.x, segment.from.y, segment.to.x, segment.to.y))
      mesh.count = index
    }

    this.triangleWallMesh.geometry.dispose()
    this.triangleWallMesh.geometry = new THREE.BufferGeometry()
    this.triangleWallMesh.geometry.setAttribute('position', new THREE.BufferAttribute(
      state.runtime.grid.type === 'triangle'
        ? buildTriangleWallPositions(state.runtime, thickness)
        : new Float32Array(),
      3,
    ))
    this.triangleWallMesh.visible = state.runtime.grid.type === 'triangle'
    this.wallMaterial.color.set(state.wallColor)
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
    if (this.lastOverlayKey === state.overlayKey) {
      return
    }
    this.lastOverlayKey = state.overlayKey

    this.ensureOverlayMeshes(state)
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()

    const lineMesh = this.overlayLineMesh
    if (lineMesh) {
      let index = 0
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
