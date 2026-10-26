import type { ShapeGridTopology } from '../src/lib/shape-mask'
import { describe, expect, it } from 'vitest'
import { findMaskRegions } from '../src/lib/shape-mask'
import { buildTopologyCropLayout, createShapeCrop, dragShapeCrop, getShapeCropCorners, hitShapeCrop } from '../src/lib/topology-crop'

const topologies: ShapeGridTopology[] = [
  { type: 'square' },
  { type: 'triangle', layout: 'triangle' },
  { type: 'triangle', layout: 'rectangle' },
  { type: 'hexagon', layout: 'hexagon', orientation: 'pointy' },
  { type: 'hexagon', layout: 'hexagon', orientation: 'flat' },
  { type: 'hexagon', layout: 'rectangle', orientation: 'pointy' },
  { type: 'hexagon', layout: 'rectangle', orientation: 'flat' },
  { type: 'circular' },
]

describe('current topology image crop', () => {
  it.each(topologies)('builds a complete, connected $type $layout $orientation grid and closed outline', (topology) => {
    const layout = buildTopologyCropLayout(6, topology)
    const regions = findMaskRegions(layout.mask, topology)
    expect(regions.count).toBe(1)
    expect(regions.cellCount).toBeGreaterThan(0)
    expect(layout.outline.length).toBeGreaterThanOrEqual(3)
    expect(layout.outline.length).toBeLessThanOrEqual(layout.segments.length)
    for (const point of layout.outline) {
      expect(point.x).toBeGreaterThanOrEqual(-1e-8)
      expect(point.x).toBeLessThanOrEqual(1 + 1e-8)
      expect(point.y).toBeGreaterThanOrEqual(-1e-8)
      expect(point.y).toBeLessThanOrEqual(1 + 1e-8)
    }
    const crop = createShapeCrop(400, 300, layout.aspect)
    expect(crop.width / crop.height).toBeCloseTo(layout.aspect)
    expect(crop.x + crop.width).toBeLessThanOrEqual(400 + 1e-8)
    expect(crop.y + crop.height).toBeLessThanOrEqual(300 + 1e-8)
    expect(hitShapeCrop(crop, { x: crop.x + crop.width / 2, y: crop.y + crop.height / 2 }, 1, layout.outline)).toBe('move')
  })

  it('uses the selected triangle shape and the exact hexagonal cell boundary', () => {
    const triangle = buildTopologyCropLayout(6, { type: 'triangle', layout: 'triangle' })
    expect(triangle.mask.flat().filter(Boolean)).toHaveLength(36)
    expect(triangle.aspect).toBeCloseTo(2 / Math.sqrt(3))
    const hexagon = buildTopologyCropLayout(6, { type: 'hexagon', layout: 'hexagon', orientation: 'pointy' })
    expect(hexagon.mask.flat().filter(Boolean)).toHaveLength(91)
    expect(hexagon.outline.length).toBeGreaterThan(6)
  })

  it('keeps corner resizing proportional and within image bounds', () => {
    const original = createShapeCrop(400, 300, 2 / Math.sqrt(3))
    const corner = getShapeCropCorners(original).find(corner => corner.handle === 'se')!
    const resized = dragShapeCrop(original, 'se', corner.point, { x: original.x + original.width / 2, y: original.y + original.height / 2 }, 400, 300)
    expect(resized.width).toBeCloseTo(original.width / 2)
    expect(resized.width / resized.height).toBeCloseTo(original.width / original.height)
    const moved = dragShapeCrop(resized, 'move', { x: 0, y: 0 }, { x: 10000, y: 10000 }, 400, 300)
    expect(moved.x + moved.width).toBeCloseTo(400)
    expect(moved.y + moved.height).toBeCloseTo(300)
  })

  it('does not treat the area outside the triangle as draggable shape content', () => {
    const layout = buildTopologyCropLayout(6, { type: 'triangle', layout: 'triangle' })
    const crop = createShapeCrop(400, 300, layout.aspect)
    expect(hitShapeCrop(crop, { x: crop.x + crop.width * 0.1, y: crop.y + crop.height * 0.1 }, 1, layout.outline)).toBeNull()
  })
})
