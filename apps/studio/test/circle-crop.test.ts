import { describe, expect, it } from 'vitest'
import { createCircleCrop, dragCircleCrop, getCircleCropCorners, hitCircleCrop } from '../src/lib/circle-crop'

describe('circular image crop', () => {
  it('starts with a centered circle fitting the image', () => {
    expect(createCircleCrop(200, 100)).toEqual({ x: 50, y: 0, size: 100 })
    expect(createCircleCrop(100, 200)).toEqual({ x: 0, y: 50, size: 100 })
  })

  it('moves the crop while keeping it inside the image', () => {
    const crop = { x: 20, y: 20, size: 40 }
    expect(dragCircleCrop(crop, 'move', { x: 40, y: 40 }, { x: 50, y: 55 }, 100, 100)).toEqual({ x: 30, y: 35, size: 40 })
    expect(dragCircleCrop(crop, 'move', { x: 40, y: 40 }, { x: -50, y: 500 }, 100, 100)).toEqual({ x: 0, y: 60, size: 40 })
  })

  it.each(getCircleCropCorners({ x: 20, y: 20, size: 60 }))('resizes from $handle without changing the opposite corner', ({ handle, point }) => {
    const crop = { x: 20, y: 20, size: 60 }
    const pointer = { x: handle.endsWith('e') ? 60 : 40, y: handle.startsWith('s') ? 60 : 40 }
    const resized = dragCircleCrop(crop, handle, point, pointer, 100, 100)
    expect(resized.size).toBe(40)
    const opposite = getCircleCropCorners(crop).find(corner => corner.point.x !== point.x && corner.point.y !== point.y)!
    expect(getCircleCropCorners(resized).find(corner => corner.handle === opposite.handle)?.point).toEqual(opposite.point)
  })

  it('bounds resizing at the image edge and prevents a zero-sized crop', () => {
    const crop = { x: 20, y: 20, size: 40 }
    expect(dragCircleCrop(crop, 'se', { x: 60, y: 60 }, { x: 500, y: 500 }, 100, 80).size).toBe(60)
    expect(dragCircleCrop(crop, 'se', { x: 60, y: 60 }, { x: -1, y: -1 }, 100, 80).size).toBe(16)
    expect(dragCircleCrop(createCircleCrop(4, 4), 'se', { x: 4, y: 4 }, { x: 0, y: 0 }, 4, 4).size).toBe(4)
  })

  it('distinguishes resize handles, dragging inside the circle, and the masked outside', () => {
    const crop = { x: 20, y: 20, size: 60 }
    expect(hitCircleCrop(crop, { x: 20, y: 20 }, 3)).toBe('nw')
    expect(hitCircleCrop(crop, { x: 50, y: 50 }, 3)).toBe('move')
    expect(hitCircleCrop(crop, { x: 25, y: 25 }, 3)).toBeNull()
    expect(hitCircleCrop(crop, { x: 10, y: 10 }, 3)).toBeNull()
  })
})
