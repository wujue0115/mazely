import type { Webgl2dViewState } from '../src/lib/webgl-2d-view'
import { createMaze } from 'mazely'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { getCellBoundarySegments, getSharedBoundary } from '../src/lib/grid-geometry'
import {
  buildTriangleWallStripPositions,
  get60DegreeMiterPoint,
  get60DegreeOppositeWallSegment,
  get120DegreeMiterPoint,
  getFacingOppositeWalls,
  getOverlaySegmentRenderLength,
  getParallelTerminalNormalSign,
  getTrianglePassageInset,
  getTriangleTerminalPoint,
  has120DegreeWallJoint,
  Webgl2dMazeView,
} from '../src/lib/webgl-2d-view'

describe('webGL 2D wall rendering', () => {
  it('does not extend butt-capped path segments past their junctions', () => {
    expect(getOverlaySegmentRenderLength(1, 0.18, 'butt')).toBe(1)
    expect(getOverlaySegmentRenderLength(1, 0.18, 'square')).toBe(1.18)
  })

  it('rebuilds walls when a same-sized maze runtime replaces the current one', () => {
    const openRuntime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })
    openRuntime.openAllEdges()
    const closedRuntime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })
    const view = Object.create(Webgl2dMazeView.prototype) as Webgl2dMazeView
    const wallMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial(),
      7,
    )

    Reflect.set(view, 'wallMesh', wallMesh)
    Reflect.set(view, 'triangleWallMesh', createTriangleWallMesh())
    Reflect.set(view, 'wallMaterial', new THREE.MeshBasicMaterial())
    Reflect.set(view, 'wallRuntime', null)
    Reflect.set(view, 'lastWallKey', '')

    syncWalls(view, wallState(openRuntime))
    expect(wallMesh.count).toBe(6)

    syncWalls(view, wallState(closedRuntime))
    expect(wallMesh.count).toBe(7)
  })

  it('keeps triangular wall segments aligned to their cell edges', () => {
    const runtime = createMaze({ grid: { layout: 'triangle', size: 1, type: 'triangle' } })
    const view = Object.create(Webgl2dMazeView.prototype) as Webgl2dMazeView
    const wallMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial(),
      3,
    )

    Reflect.set(view, 'wallMesh', wallMesh)
    const triangleWallMesh = createTriangleWallMesh()
    Reflect.set(view, 'triangleWallMesh', triangleWallMesh)
    Reflect.set(view, 'wallMaterial', new THREE.MeshBasicMaterial())
    Reflect.set(view, 'wallRuntime', null)
    Reflect.set(view, 'lastWallKey', '')

    syncWalls(view, wallState(runtime))

    expect(wallMesh.count).toBe(0)
    const positions = triangleWallMesh.geometry.getAttribute('position')
    expect(positions.count).toBeGreaterThan(0)
    const xs = Array.from({ length: positions.count }, (_, index) => positions.getX(index))
    const ys = Array.from({ length: positions.count }, (_, index) => positions.getY(index))
    expect(Math.min(...xs)).toBeLessThan(0)
    expect(Math.max(...xs)).toBeGreaterThan(1)
    expect(Math.max(...ys)).toBeGreaterThan(0)
    expect(Math.min(...ys)).toBeLessThan(-Math.sqrt(3) / 2)
  })

  it('cuts an isolated wall endpoint to the opposing triangle edges', () => {
    const height = Math.sqrt(3) / 2
    const positions = buildTriangleWallStripPositions([
      { x: 0.5, y: 0 },
      { x: 1, y: height },
      { x: 0, y: height },
    ], {
      from: { x: 0.5, y: 0 },
      to: { x: 0, y: height },
    }, 0.1)
    const points = Array.from({ length: positions.length / 3 }, (_, index) => ({
      x: positions[index * 3],
      y: positions[index * 3 + 1],
    }))
    expect(points.some(point => Math.abs(point.x - 0.5) < 1e-6 && Math.abs(point.y) < 1e-6)).toBe(true)
    expect(points.some(point => Math.abs(point.x) < 1e-6 && Math.abs(point.y + height) < 1e-6)).toBe(true)
  })

  it('adds a sharp miter only to 120-degree wall joints', () => {
    const radius = 0.05
    const sixtyDegrees = Math.PI / 3
    const oneHundredTwentyDegrees = Math.PI * 2 / 3
    expect(get120DegreeMiterPoint(
      { x: 1, y: 0 },
      { x: Math.cos(sixtyDegrees), y: Math.sin(sixtyDegrees) },
      radius,
    )).toBeNull()
    const miter = get120DegreeMiterPoint(
      { x: 1, y: 0 },
      { x: Math.cos(oneHundredTwentyDegrees), y: Math.sin(oneHundredTwentyDegrees) },
      radius,
    )
    expect(Math.hypot(miter!.x, miter!.y)).toBeCloseTo(radius / Math.sin(oneHundredTwentyDegrees / 2))
  })

  it('points a 60-degree wall joint only when its parallel opposite wall is open', () => {
    const radius = 0.05
    const sixtyDegrees = Math.PI / 3
    const first = { x: 1, y: 0 }
    const second = { x: Math.cos(sixtyDegrees), y: Math.sin(sixtyDegrees) }

    expect(get60DegreeMiterPoint(first, second, radius, true)).toBeNull()
    const miter = get60DegreeMiterPoint(first, second, radius, false)
    expect(Math.hypot(miter!.x, miter!.y)).toBeCloseTo(radius / Math.sin(sixtyDegrees / 2))
  })

  it('checks for a parallel wall on the outward side of a 60-degree joint', () => {
    const sixtyDegrees = Math.PI / 3
    const junction = { x: 3, y: 4 }
    expect(get60DegreeOppositeWallSegment(
      junction,
      { x: 1, y: 0 },
      { x: Math.cos(sixtyDegrees), y: Math.sin(sixtyDegrees) },
    )).toEqual({
      from: { x: 2, y: 4 },
      to: {
        x: 3 - Math.cos(sixtyDegrees),
        y: 4 - Math.sin(sixtyDegrees),
      },
    })
  })

  it('keeps every triangular edge opening at the same width', () => {
    const thickness = 0.2
    const inset = getTrianglePassageInset(thickness)
    expect(inset).toBeCloseTo(thickness / Math.sqrt(3))
    expect(1 - inset * 2).toBeCloseTo(1 - thickness * 2 / Math.sqrt(3))
  })

  it('applies that width to every opening in the rendered wall mesh', () => {
    const runtime = createMaze({ grid: { layout: 'triangle', size: 4, type: 'triangle' }, seed: 'wall-widths' })
    runtime.generate('dfs').finish()
    const thickness = 0.2
    const positions = getRenderedTriangleWallPositions(runtime, thickness)
    const openings = new Map<string, { from: Point, to: Point }>()

    for (const cell of runtime.grid.cells) {
      for (const segment of getCellBoundarySegments(cell)) {
        if (segment.opened) {
          openings.set(segmentKey(segment), segment)
        }
      }
    }

    const expectedWidth = 1 - getTrianglePassageInset(thickness) * 2
    const widths = [...openings.values()].map(opening => measureClearWidth(positions, opening))
    expect(widths.length).toBeGreaterThan(0)
    for (const width of widths) {
      expect(width).toBeCloseTo(expectedWidth, 2)
    }
  })

  it('renders isolated wall ends with a single-sided diagonal point', () => {
    const runtime = createMaze({
      grid: { cols: 9, layout: 'rectangle', rows: 5, type: 'triangle' },
    })
    runtime.openAllEdges()
    const from = runtime.grid.getCell('2:3')!
    const to = runtime.grid.getCell('2:4')!
    runtime.setEdgeOpenedBetween({ x: from.col, y: from.row }, { x: to.col, y: to.row }, false)
    const wall = getSharedBoundary(from, to)!
    const thickness = 0.2
    const inset = getTrianglePassageInset(thickness)
    const positions = getRenderedTriangleWallPositions(runtime, thickness)
    const dx = wall.to.x - wall.from.x
    const dy = wall.to.y - wall.from.y
    const length = Math.hypot(dx, dy)
    const tips = [
      {
        x: wall.from.x - dx / length * inset * 1.5 - dy / length * thickness / 2,
        y: wall.from.y - dy / length * inset * 1.5 + dx / length * thickness / 2,
      },
      {
        x: wall.to.x + dx / length * inset * 1.5 + dy / length * thickness / 2,
        y: wall.to.y + dy / length * inset * 1.5 - dx / length * thickness / 2,
      },
    ]

    for (const tip of tips) {
      expect(hasWallVertex(positions, { x: tip.x, y: -tip.y })).toBe(true)
    }
  })

  it('centers the terminal point for a 120-degree wall joint', () => {
    const thickness = 0.2
    const inset = getTrianglePassageInset(thickness)
    const junction = { x: 2, y: 3 }
    const outward = { x: 1, y: 0 }
    const normal = { x: 0, y: 1 }

    expect(getTriangleTerminalPoint(junction, outward, normal, thickness, false)).toEqual({
      x: junction.x + inset * 1.5,
      y: junction.y + thickness / 2,
    })
    expect(getTriangleTerminalPoint(junction, outward, normal, thickness, true)).toEqual({
      x: junction.x + inset,
      y: junction.y,
    })
  })

  it('finds any 120-degree pair when the opposite joint has extra walls', () => {
    const sixtyDegrees = Math.PI / 3
    const walls = [
      { x: Math.cos(sixtyDegrees), y: Math.sin(sixtyDegrees) },
      { x: Math.cos(-sixtyDegrees), y: Math.sin(-sixtyDegrees) },
      { x: -1, y: 0 },
    ]

    expect(has120DegreeWallJoint(walls)).toBe(true)
    expect(has120DegreeWallJoint([
      { x: 1, y: 0 },
      { x: Math.cos(sixtyDegrees), y: Math.sin(sixtyDegrees) },
    ])).toBe(false)
  })

  it('aligns a trapezoid terminal edge with the wall across the passage', () => {
    const thickness = 0.2
    const outward = { x: 1, y: 0 }
    const normal = { x: 0, y: 1 }
    const sixtyDegrees = Math.PI / 3

    expect(getParallelTerminalNormalSign(outward, normal, thickness, [
      { x: Math.cos(sixtyDegrees), y: Math.sin(sixtyDegrees) },
    ])).toBe(1)
    expect(getParallelTerminalNormalSign(outward, normal, thickness, [
      { x: Math.cos(-sixtyDegrees), y: Math.sin(-sixtyDegrees) },
    ])).toBe(-1)
  })

  it('uses the side of a 60-degree joint that faces the terminal', () => {
    const sixtyDegrees = Math.PI / 3
    const outward = { x: 1, y: 0 }
    const oppositeWalls = [
      { x: Math.cos(sixtyDegrees), y: Math.sin(sixtyDegrees) },
      { x: Math.cos(Math.PI - sixtyDegrees), y: Math.sin(Math.PI - sixtyDegrees) },
    ]

    const facingWalls = getFacingOppositeWalls(outward, oppositeWalls)
    expect(facingWalls).toHaveLength(1)
    expect(facingWalls[0]).toEqual(oppositeWalls[1])
    expect(getParallelTerminalNormalSign(
      outward,
      { x: 0, y: 1 },
      0.2,
      facingWalls,
    )).toBe(-1)
  })
})

interface Point {
  x: number
  y: number
}

function measureClearWidth(positions: Float32Array, segment: { from: Point, to: Point }): number {
  const samples = 2000
  let clear = 0
  for (let index = 0; index < samples; index += 1) {
    const ratio = (index + 0.5) / samples
    const point = {
      x: segment.from.x + (segment.to.x - segment.from.x) * ratio,
      y: -(segment.from.y + (segment.to.y - segment.from.y) * ratio),
    }
    if (!isInsideWallMesh(positions, point)) {
      clear += 1
    }
  }
  return clear / samples
}

function isInsideWallMesh(positions: Float32Array, point: Point): boolean {
  for (let offset = 0; offset < positions.length; offset += 9) {
    const a = { x: positions[offset], y: positions[offset + 1] }
    const b = { x: positions[offset + 3], y: positions[offset + 4] }
    const c = { x: positions[offset + 6], y: positions[offset + 7] }
    const first = cross(a, b, point)
    const second = cross(b, c, point)
    const third = cross(c, a, point)
    if ((first >= -1e-7 && second >= -1e-7 && third >= -1e-7)
      || (first <= 1e-7 && second <= 1e-7 && third <= 1e-7)) {
      return true
    }
  }
  return false
}

function cross(from: Point, to: Point, point: Point): number {
  return (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x)
}

function segmentKey(segment: { from: Point, to: Point }): string {
  const from = `${segment.from.x.toFixed(6)},${segment.from.y.toFixed(6)}`
  const to = `${segment.to.x.toFixed(6)},${segment.to.y.toFixed(6)}`
  return from < to ? `${from}>${to}` : `${to}>${from}`
}

function hasWallVertex(positions: Float32Array, point: Point): boolean {
  for (let offset = 0; offset < positions.length; offset += 3) {
    if (Math.abs(positions[offset] - point.x) < 1e-6
      && Math.abs(positions[offset + 1] - point.y) < 1e-6) {
      return true
    }
  }
  return false
}

function getRenderedTriangleWallPositions(
  runtime: ReturnType<typeof createMaze>,
  wallThickness: number,
): Float32Array {
  const view = Object.create(Webgl2dMazeView.prototype) as Webgl2dMazeView
  Reflect.set(view, 'wallMesh', new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial(),
    runtime.grid.cells.length * 4,
  ))
  const triangleWallMesh = createTriangleWallMesh()
  Reflect.set(view, 'triangleWallMesh', triangleWallMesh)
  Reflect.set(view, 'wallMaterial', new THREE.MeshBasicMaterial())
  Reflect.set(view, 'wallRuntime', null)
  Reflect.set(view, 'lastWallKey', '')
  syncWalls(view, { ...wallState(runtime), wallThickness })
  return triangleWallMesh.geometry.getAttribute('position').array as Float32Array
}

function createTriangleWallMesh(): THREE.Mesh {
  return new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
}

function wallState(runtime: ReturnType<typeof createMaze>): Webgl2dViewState {
  return {
    runtime,
    wallColor: '#fff',
    wallRevision: 0,
    wallsVisible: true,
    wallThickness: 0.1,
  } as Webgl2dViewState
}

function syncWalls(view: Webgl2dMazeView, state: Webgl2dViewState): void {
  const syncWallsIfNeeded = Reflect.get(view, 'syncWallsIfNeeded') as (state: Webgl2dViewState) => void
  syncWallsIfNeeded.call(view, state)
}
