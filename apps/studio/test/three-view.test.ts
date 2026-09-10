import { createMaze } from 'mazely'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { HEX_RADIUS, TRIANGLE_HEIGHT } from '../src/lib/grid-geometry'
import {
  buildTriangleWallGeometry,
  createHexFloorGeometry,
  createTriangleFloorGeometry,
  setThreeWallMatrix,
} from '../src/lib/three-view'
import { buildTriangleWallPositions } from '../src/lib/webgl-2d-view'

describe('3D triangle geometry', () => {
  it('builds a regular hexagonal floor prism', () => {
    const geometry = createHexFloorGeometry()
    geometry.computeBoundingBox()

    expect(geometry.boundingBox?.min.x).toBeCloseTo(-0.5)
    expect(geometry.boundingBox?.max.x).toBeCloseTo(0.5)
    expect(geometry.boundingBox?.min.z).toBeCloseTo(-HEX_RADIUS)
    expect(geometry.boundingBox?.max.z).toBeCloseTo(HEX_RADIUS)
  })

  it('builds an equilateral floor prism around the cell centroid', () => {
    const depth = 0.08
    const geometry = createTriangleFloorGeometry(depth)
    geometry.computeBoundingBox()

    expect(geometry.boundingBox?.min.x).toBeCloseTo(-0.5)
    expect(geometry.boundingBox?.max.x).toBeCloseTo(0.5)
    expect(geometry.boundingBox?.min.y).toBeCloseTo(-depth)
    expect(geometry.boundingBox?.max.y).toBeCloseTo(0)
    expect(geometry.boundingBox?.min.z).toBeCloseTo(-TRIANGLE_HEIGHT * 2 / 3)
    expect(geometry.boundingBox?.max.z).toBeCloseTo(TRIANGLE_HEIGHT / 3)
  })

  it('aligns wall boxes to sloped triangle edges', () => {
    const matrix = new THREE.Matrix4()
    const height = 0.6
    const thickness = 0.1
    setThreeWallMatrix(matrix, {
      from: { x: 0.5, y: 0 },
      to: { x: 1, y: TRIANGLE_HEIGHT },
    }, height, thickness)

    const position = new THREE.Vector3()
    const rotation = new THREE.Quaternion()
    const scale = new THREE.Vector3()
    matrix.decompose(position, rotation, scale)

    expect(position.x).toBeCloseTo(0.75)
    expect(position.y).toBeCloseTo(height / 2)
    expect(position.z).toBeCloseTo(TRIANGLE_HEIGHT / 2)
    expect(scale.x).toBeCloseTo(1 + thickness)
    expect(scale.y).toBeCloseTo(height)
    expect(scale.z).toBeCloseTo(thickness)
  })

  it('extrudes the exact 2D wall footprint for Triangle junctions', () => {
    const runtime = createMaze({ grid: { layout: 'triangle', size: 3, type: 'triangle' } })
    runtime.generate('dfs', { seed: 'three-view-junctions' }).finish()
    const thickness = 0.12
    const height = 0.6
    const footprint = buildTriangleWallPositions(runtime, thickness)
    const geometry = buildTriangleWallGeometry(runtime, thickness, height)
    const positions = geometry.getAttribute('position')
    const topPoints = new Set<string>()

    for (let index = 0; index < positions.count; index += 1) {
      if (Math.abs(positions.getY(index) - height) < 1e-6) {
        topPoints.add(`${positions.getX(index).toFixed(6)},${positions.getZ(index).toFixed(6)}`)
      }
    }
    for (let offset = 0; offset < footprint.length; offset += 3) {
      expect(topPoints.has(`${footprint[offset].toFixed(6)},${(-footprint[offset + 1]).toFixed(6)}`)).toBe(true)
    }
    expect(positions.count).toBeGreaterThan(footprint.length / 9 * 6)
    expect(positions.count % 3).toBe(0)
  })

  it('extrudes the exact 2D wall footprint for Hexagon junctions', () => {
    const runtime = createMaze({ grid: { layout: 'hexagon', size: 3, type: 'hexagon' } })
    runtime.generate('dfs').finish()
    const footprint = buildTriangleWallPositions(runtime, 0.12)
    const geometry = buildTriangleWallGeometry(runtime, 0.12, 0.6)

    expect(footprint.length).toBeGreaterThan(0)
    expect(geometry.getAttribute('position').count).toBeGreaterThan(footprint.length / 9 * 6)
  })
})
