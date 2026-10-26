import { createMaze } from 'mazely'
import { describe, expect, it } from 'vitest'
import { getPolarBoundaries } from '../src/lib/grid-geometry'
import { buildAutoPixelMask, buildCellColors, buildCellMask, findMaskRegions, findShapeCellAtPixel, getShapeGridDimensions, keepLargestMaskRegion, setShapeCellPixels } from '../src/lib/shape-mask'
import { buildCircularWallGeometry } from '../src/lib/webgl-2d-view'

const topology = { type: 'circular' } as const

describe('circular image shapes', () => {
  it.each([0, 255])('keeps a full circle when the image background alpha is %i', (alpha) => {
    const data = new Uint8ClampedArray(20 * 20 * 4)
    for (let y = 0; y < 20; y += 1) {
      for (let x = 0; x < 20; x += 1) {
        const foreground = x >= 8 && x < 12 && y >= 8 && y < 12
        data.set(foreground ? [255, 0, 0, 255] : [255, 255, 255, alpha], (y * 20 + x) * 4)
      }
    }
    const image = { data, width: 20, height: 20 } as ImageData
    const pixels = buildAutoPixelMask(image, 32, topology)
    const mask = buildCellMask(pixels, 12, 3, topology)
    const runtime = createMaze({ grid: { type: 'circular', rings: 3, mask } })
    expect(runtime.grid.cells).toHaveLength(19)
    expect(mask.every(row => row.every(Boolean))).toBe(true)
    expect(buildAutoPixelMask(image, 32).data[0]).toBe(0)
  })

  it('fits a round grid into a rectangular image and samples all sectors', () => {
    const pixels = { width: 120, height: 100, data: new Uint8Array(12000).fill(1) }
    const dimensions = getShapeGridDimensions(120, 100, 3, topology)
    expect(dimensions).toEqual({ cols: 12, rows: 3 })
    expect(buildCellMask(pixels, 12, 3, topology).map(row => row.length)).toEqual([1, 6, 12])
    expect(findShapeCellAtPixel(pixels, 60, 50, 12, 3, topology)).toEqual({ x: 0, y: 0 })
    expect(findShapeCellAtPixel(pixels, 0, 0, 12, 3, topology)).toBeNull()
    setShapeCellPixels(pixels, 0, 0, 12, 3, topology, 0)
    const mask = buildCellMask(pixels, 12, 3, topology)
    expect(mask[0]).toEqual([false])
    expect(mask[1].every(Boolean)).toBe(true)
    const image = { width: 120, height: 100, data: new Uint8ClampedArray(48000) } as ImageData
    for (let i = 0; i < image.data.length; i += 4) image.data.set([255, 0, 0, 255], i)
    const colors = buildCellColors(image, pixels, mask, 12, 3, topology)
    expect(colors[0]).toEqual([null])
    expect(colors[2]).toEqual(Array.from({ length: 12 }, () => '#ff0000'))
  })

  it('uses wraparound and split-ring adjacency to keep the largest region', () => {
    const mask = [[false], [true, false, false, true, false, true], [true, true]]
    expect(findMaskRegions(mask, topology)).toMatchObject({ count: 2, largestSize: 4, cellCount: 5 })
    const kept = keepLargestMaskRegion(mask, topology)
    expect(kept[1][3]).toBe(false)
    expect(kept[1][5]).toBe(true)
    expect(kept[2]).toEqual([true, true])
  })

  it('renders every missing arc when several separated child sectors are removed', () => {
    const runtime = createMaze({ grid: { rings: 2, mask: [[true], [false, true, false, true, false, true]], type: 'circular' } })
    runtime.openAllEdges()
    const geometry = buildCircularWallGeometry(runtime, 0.1)
    const positions = geometry.getAttribute('position')
    const indices = geometry.getIndex()!
    for (const angle of [Math.PI / 6, Math.PI * 5 / 6, Math.PI * 3 / 2]) {
      const point = { x: 2 + Math.cos(angle), y: -2 - Math.sin(angle) }
      let found = false
      for (let i = 0; i < indices.count; i += 3) {
        const ids = [indices.getX(i), indices.getX(i + 1), indices.getX(i + 2)]
        if (ids[0] === ids[1])
          continue
        const vertices = ids.map(id => ({ x: positions.getX(id), y: positions.getY(id) }))
        const crosses = vertices.map((from, index) => {
          const to = vertices[(index + 1) % 3]
          return (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x)
        })
        if (crosses.every(value => value >= -1e-7) || crosses.every(value => value <= 1e-7))
          found = true
      }
      expect(found).toBe(true)
    }
    geometry.dispose()
  })

  it('closes the inner hole and missing child arcs without closing surviving passages', () => {
    const runtime = createMaze({ grid: { rings: 3, mask: [[false], [true], [true]], type: 'circular' } })
    runtime.openAllEdges()
    const parent = runtime.grid.getCell('1:0')!
    const boundaries = getPolarBoundaries(parent as Parameters<typeof getPolarBoundaries>[0])
    const arcs = boundaries.filter(boundary => boundary.kind === 'arc')
    expect(arcs).toHaveLength(3)
    expect(arcs.filter(boundary => boundary.opened)).toHaveLength(1)
    expect(arcs.filter(boundary => !boundary.opened).map(boundary => boundary.radius).sort()).toEqual([1, 2])
  })
})
