import type { ThreeViewSyncState } from '../src/lib/three-view'
import type { Webgl2dViewState } from '../src/lib/webgl-2d-view'
import { createMaze } from 'mazely'
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { CircularCellGeometry } from '../src/lib/circular-cell-geometry'
import { CircularWallGeometry } from '../src/lib/circular-wall-geometry'
import { getCellPolygon } from '../src/lib/grid-geometry'
import { getPolarArcSegments } from '../src/lib/polar-resolution'
import { ThreeMazeView } from '../src/lib/three-view'
import { buildCircularPathGeometry, Webgl2dMazeView } from '../src/lib/webgl-2d-view'

const circle = () => createMaze({ grid: { rings: 5, type: 'circular' }, seed: 'animation' })

describe('circular animation buffers', () => {
  it.each(['xy', 'xz'] as const)('keeps %s positions and updates only changed cell colors', (plane) => {
    const runtime = circle()
    const geometry = new CircularCellGeometry(runtime.grid.cells, plane)
    const positions = geometry.getAttribute('position')
    const colors = geometry.getAttribute('color') as THREE.BufferAttribute
    const values = new Map(runtime.grid.cells.map(cell => [cell.id, '#ffffff']))
    const colorAt = (x: number, y: number) => values.get(`${y}:${x}`)!
    geometry.updateColors(colorAt)
    const before = [...colors.array]
    const version = colors.version
    colors.clearUpdateRanges()
    geometry.updateColors(colorAt)
    expect(colors.version).toBe(version)
    expect(colors.updateRanges).toHaveLength(0)
    values.set('2:0', '#ff0000')
    geometry.updateColors(colorAt)
    expect(geometry.getAttribute('position')).toBe(positions)
    expect(colors.version).toBe(version + 1)
    expect(colors.updateRanges).toHaveLength(1)
    const range = colors.updateRanges[0]
    expect([...colors.array.slice(0, range.start)]).toEqual(before.slice(0, range.start))
    expect([...colors.array.slice(range.start + range.count)]).toEqual(before.slice(range.start + range.count))
    expect(colors.getX(range.start / 3)).toBe(1)
    expect(colors.getY(range.start / 3)).toBe(0)
    geometry.dispose()
  })

  it.each(['2D', '3D'] as const)('reuses %s tiles through playback and replaces them for a new runtime', (mode) => {
    const runtime = circle()
    const view = Object.create(mode === '2D' ? Webgl2dMazeView.prototype : ThreeMazeView.prototype)
    const group = new THREE.Group()
    Reflect.set(view, 'mazeGroup', group)
    Reflect.set(view, mode === '2D' ? 'cellMesh' : 'floorMesh', new THREE.Mesh())
    Reflect.set(view, mode === '2D' ? 'circularCellMaterial' : 'circularFloorMaterial', new THREE.MeshBasicMaterial())
    const method = Reflect.get(view, mode === '2D' ? 'syncCellsIfNeeded' : 'syncFloor')
    const state = { runtime, cellKey: '0', getCellColor: () => '#ffffff' }
    method.call(view, state)
    const field = mode === '2D' ? 'circularCellMesh' : 'circularFloorMesh'
    const mesh = Reflect.get(view, field) as THREE.Mesh
    const geometry = mesh.geometry
    const dispose = vi.spyOn(geometry, 'dispose')
    method.call(view, { ...state, cellKey: '1', getCellColor: () => '#ff0000' })
    expect(Reflect.get(view, field)).toBe(mesh)
    expect(mesh.geometry).toBe(geometry)
    expect(dispose).not.toHaveBeenCalled()
    method.call(view, { ...state, runtime: circle() })
    expect(dispose).toHaveBeenCalledOnce()
    expect(Reflect.get(view, field)).not.toBe(mesh)
  })

  it('keeps circular walls hidden when their visibility is toggled off', () => {
    const view = Object.create(Webgl2dMazeView.prototype)
    const runtime = circle()
    const circularWallMesh = new THREE.Mesh()
    Reflect.set(view, 'wallMesh', { count: 10 })
    Reflect.set(view, 'wallMaterial', new THREE.MeshBasicMaterial())
    Reflect.set(view, 'triangleWallMesh', new THREE.Mesh())
    Reflect.set(view, 'circularWallMesh', circularWallMesh)
    Reflect.get(view, 'syncWallsIfNeeded').call(view, {
      runtime,
      wallsVisible: false,
      wallThickness: 0.1,
      wallRevision: 0,
      wallColor: '#ffffff',
    } as Webgl2dViewState)
    expect(circularWallMesh.visible).toBe(false)
  })

  it('does not rebuild 2D or 3D walls as the solver visits cells', () => {
    for (const mode of ['2D', '3D']) {
      const runtime = circle()
      runtime.generate('dfs').finish()
      const player = runtime.solve('bfs', { start: { x: 0, y: 0 }, end: { x: 0, y: 4 } })
      const view = Object.create(mode === '2D' ? Webgl2dMazeView.prototype : ThreeMazeView.prototype)
      Reflect.set(view, 'wallMesh', new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 1))
      Reflect.set(view, 'wallMaterial', new THREE.MeshBasicMaterial())
      const wallMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
      Reflect.set(view, 'triangleWallMesh', wallMesh)
      const circularWallMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial())
      Reflect.set(view, 'circularWallMesh', circularWallMesh)
      const method = Reflect.get(view, mode === '2D' ? 'syncWallsIfNeeded' : 'syncWalls')
      const state = { runtime, wallsVisible: true, wallThickness: 0.1, wallHeight: 0.6, wallRevision: 0, wallColor: '#ffffff' } as Webgl2dViewState & ThreeViewSyncState
      method.call(view, state)
      const mesh = mode === '2D' ? circularWallMesh : wallMesh
      const geometry = mesh.geometry
      const dispose = vi.spyOn(geometry, 'dispose')
      player.next(5)
      method.call(view, state)
      expect(mesh.geometry).toBe(geometry)
      expect(dispose).not.toHaveBeenCalled()
      const indices = geometry.getIndex()!
      const version = indices.version
      const edge = runtime.grid.edges.find(edge => !edge.opened)!
      edge.open()
      method.call(view, { ...state, wallRevision: 1 })
      expect(mesh.geometry).toBe(geometry)
      expect(indices.version).toBeGreaterThan(version)
      expect(dispose).not.toHaveBeenCalled()
    }
  })
})

describe('large circular animation cost', () => {
  it('bounds fill and wall vertex counts for a 40-ring maze', () => {
    const runtime = createMaze({ grid: { rings: 40, type: 'circular' } })
    const fill = new CircularCellGeometry(runtime.grid.cells, 'xy')
    const walls = new CircularWallGeometry(runtime, 0.1)
    // Guard against returning to fixed 0.04-unit sampling (over 1M fill vertices).
    expect(fill.getAttribute('position').count).toBeLessThan(runtime.grid.cells.length * 24)
    expect(walls.getAttribute('position').count).toBeLessThan(runtime.grid.cells.length * 30)
    fill.dispose()
    walls.dispose()
  })

  it.each([undefined, 0.6])('updates open/close/rewind indices with height %s without reallocating', (height) => {
    const runtime = circle()
    const walls = new CircularWallGeometry(runtime, 0.1, height)
    const positions = walls.getAttribute('position')
    const indices = walls.getIndex()!
    const original = indices.array.slice()
    indices.clearUpdateRanges()
    const edge = runtime.grid.edges[0]
    edge.open()
    walls.syncVisibility()
    expect(walls.getAttribute('position')).toBe(positions)
    expect(walls.getIndex()).toBe(indices)
    expect(indices.updateRanges.length).toBeGreaterThan(0)
    expect(indices.updateRanges.reduce((sum, range) => sum + range.count, 0)).toBeLessThan(indices.count / 10)
    expect([...indices.array]).not.toEqual([...original])
    const version = indices.version
    walls.syncVisibility()
    expect(indices.version).toBe(version)
    edge.close()
    walls.syncVisibility()
    expect([...indices.array]).toEqual([...original])
    walls.dispose()
  })

  it('keeps chord error bounded as radius grows', () => {
    for (const radius of [1, 40, 80, 250, 500]) {
      const angle = Math.PI / 3
      const steps = getPolarArcSegments(radius, angle)
      expect(radius * (1 - Math.cos(angle / steps / 2))).toBeLessThanOrEqual(0.002 + 1e-10)
    }
  })

  it('keeps coarse fill vertices identical across a large split ring', () => {
    const runtime = createMaze({ grid: { rings: 40, type: 'circular' } })
    const parent = runtime.grid.cells.find(cell => 'outward' in cell && Array.isArray(cell.outward) && cell.outward.length === 2 && cell.row > 20)!
    expect(parent).toBeDefined()
    const radius = parent.row + 1
    const arc = (cell: typeof parent) => getCellPolygon(cell)
      .filter(point => Math.abs(Math.hypot(point.x - 40, point.y - 40) - radius) < 1e-8)
      .map(point => `${point.x.toFixed(9)}:${point.y.toFixed(9)}`)
    const children = parent.getNeighbors().filter(cell => 'row' in cell && cell.row === parent.row + 1) as typeof parent[]
    expect(new Set(arc(parent))).toEqual(new Set(children.flatMap(arc)))
  })
})

describe('circular animation routes', () => {
  it('follows the short arc across the wraparound seam', () => {
    const runtime = circle()
    const geometry = buildCircularPathGeometry(runtime, [{ points: [{ x: 5, y: 1 }, { x: 0, y: 1 }], color: '#ff0000', width: 0.1 }])
    const positions = geometry.getAttribute('position')
    expect(positions.count).toBeGreaterThan(6)
    for (let i = 0; i < positions.count; i += 1) {
      const x = positions.getX(i) - 5
      const y = -positions.getY(i) - 5
      expect(Math.hypot(x, y)).toBeGreaterThan(1.4)
      expect(Math.hypot(x, y)).toBeLessThan(1.6)
      expect(Math.abs(Math.atan2(y, x))).toBeLessThan(Math.PI / 5)
    }
    geometry.dispose()
  })

  it('passes through the disk center rather than drawing a small inner loop', () => {
    const geometry = buildCircularPathGeometry(circle(), [{ points: [{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 3, y: 1 }], color: '#ff0000', width: 0.1 }])
    const positions = geometry.getAttribute('position')
    expect(Array.from({ length: positions.count }, (_, i) => Math.hypot(positions.getX(i) - 5, -positions.getY(i) - 5)).some(radius => radius < 0.1)).toBe(true)
    geometry.dispose()
  })
})
