import { describe, expect, it } from 'vitest'
import {
  buildAutoPixelMask,
  buildCellColors,
  buildCellMask,
  countMaskCells,
  findFarthestMaskCells,
  findMaskRegions,
  keepLargestMaskRegion,
  prunePixelMaskToCells,
  removeSimilarCells,
} from '../src/lib/shape-mask'

function makeImage(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y)
      const offset = (y * width + x) * 4
      data[offset] = r
      data[offset + 1] = g
      data[offset + 2] = b
      data[offset + 3] = a
    }
  }
  return { colorSpace: 'srgb', data, height, width } as ImageData
}

function maskFromStrings(lines: string[]): boolean[][] {
  return lines.map(line => [...line].map(char => char === '#'))
}

describe('shape-mask', () => {
  it('keeps opaque pixels when the image has transparency', () => {
    // 4x4 image: opaque 2x2 block in the top-left, transparent elsewhere.
    const image = makeImage(4, 4, (x, y) => (x < 2 && y < 2 ? [255, 0, 0, 255] : [0, 0, 0, 0]))
    const mask = buildAutoPixelMask(image, 30)

    expect(mask.data[0]).toBe(1)
    expect(mask.data[1]).toBe(1)
    expect(mask.data[2]).toBe(0)
    expect(mask.data[15]).toBe(0)
  })

  it('flood fills the background from borders on opaque images', () => {
    // White background with a black 2x2 block in the center of a 6x6 image.
    const image = makeImage(6, 6, (x, y) =>
      x >= 2 && x < 4 && y >= 2 && y < 4 ? [0, 0, 0, 255] : [255, 255, 255, 255])
    const mask = buildAutoPixelMask(image, 30)

    expect(mask.data[0]).toBe(0)
    expect(mask.data[2 * 6 + 2]).toBe(1)
    expect(mask.data[3 * 6 + 3]).toBe(1)
    // Only the 4 block pixels survive.
    expect(mask.data.reduce((sum, value) => sum + value, 0)).toBe(4)
  })

  it('does not remove interior holes disconnected from the border', () => {
    // Black ring on white background: the white center is enclosed, so the
    // border flood fill cannot reach it and it stays kept.
    const image = makeImage(5, 5, (x, y) => {
      const onRing = x >= 1 && x <= 3 && y >= 1 && y <= 3 && !(x === 2 && y === 2)
      return onRing ? [0, 0, 0, 255] : [255, 255, 255, 255]
    })
    const mask = buildAutoPixelMask(image, 30)

    expect(mask.data[2 * 5 + 2]).toBe(1)
    expect(mask.data[0]).toBe(0)
  })

  it('downsamples pixels to cells by majority coverage', () => {
    // 4x4 pixels -> 2x2 cells; left half kept.
    const pixelMask = {
      data: new Uint8Array([
        1,
        1,
        0,
        0,
        1,
        1,
        0,
        0,
        1,
        1,
        0,
        0,
        1,
        1,
        0,
        0,
      ]),
      height: 4,
      width: 4,
    }
    const cellMask = buildCellMask(pixelMask, 2, 2)

    expect(cellMask).toEqual([[true, false], [true, false]])
  })

  it('counts connected regions with 4-connectivity', () => {
    const mask = maskFromStrings([
      '##..#',
      '##..#',
      '.....',
      '#....',
    ])
    const regions = findMaskRegions(mask)

    expect(regions.count).toBe(3)
    expect(regions.cellCount).toBe(7)
    expect(regions.largestSize).toBe(4)
  })

  it('keeps only the largest region', () => {
    const mask = maskFromStrings([
      '##..#',
      '##..#',
      '.....',
      '#....',
    ])
    const pruned = keepLargestMaskRegion(mask)

    expect(countMaskCells(pruned)).toBe(4)
    expect(pruned[0][0]).toBe(true)
    expect(pruned[0][4]).toBe(false)
    expect(pruned[3][0]).toBe(false)
    expect(findMaskRegions(pruned).count).toBe(1)
  })

  it('clears pixels inside removed cells when pruning', () => {
    const pixelMask = {
      data: new Uint8Array([
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
        1,
      ]),
      height: 4,
      width: 4,
    }
    prunePixelMaskToCells(pixelMask, [[true, false], [true, false]])

    expect(pixelMask.data[0]).toBe(1)
    expect(pixelMask.data[2]).toBe(0)
    expect(pixelMask.data[3]).toBe(0)
    expect(pixelMask.data[12]).toBe(1)
    expect(pixelMask.data[15]).toBe(0)
  })

  it('finds far-apart start and end points inside the mask', () => {
    const mask = maskFromStrings([
      '#####',
      '#....',
      '#####',
    ])
    const startAndEndPoints = findFarthestMaskCells(mask)!

    // The two C-arm tips are the graph-diameter start and end points (distance 10
    // around the C, even though they are only 2 apart in manhattan terms).
    const tips = [startAndEndPoints.start, startAndEndPoints.end]
      .map(point => `${point.x},${point.y}`)
      .sort()
    expect(tips).toEqual(['4,0', '4,2'])
  })

  it('returns no start and end points for an empty mask', () => {
    expect(findFarthestMaskCells([[false, false]])).toBeNull()
  })

  it('averages kept pixels into per-cell colors', () => {
    // 4x4 image -> 2x2 cells: left column red, right column blue.
    const image = makeImage(4, 4, x => (x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]))
    const pixelMask = {
      data: new Uint8Array([
        1,
        1,
        0,
        0,
        1,
        1,
        0,
        0,
        1,
        1,
        0,
        0,
        1,
        1,
        0,
        0,
      ]),
      height: 4,
      width: 4,
    }
    const cellMask = [[true, false], [true, false]]
    const colors = buildCellColors(image, pixelMask, cellMask, 2, 2)

    expect(colors[0][0]).toBe('#ff0000')
    expect(colors[1][0]).toBe('#ff0000')
    expect(colors[0][1]).toBeNull()
    expect(colors[1][1]).toBeNull()
  })

  it('mixes colors within a cell and ignores removed pixels', () => {
    // One 2x2 cell: two red kept pixels, one blue kept pixel, one white
    // removed pixel. Average of kept = (255+255+0)/3 red, (0+0+255)/3 blue.
    const image = makeImage(2, 2, (x, y) =>
      (x === 1 && y === 1 ? [255, 255, 255, 255] : (x === 0 && y === 0 ? [0, 0, 255, 255] : [255, 0, 0, 255])))
    const pixelMask = { data: new Uint8Array([1, 1, 1, 0]), height: 2, width: 2 }
    const colors = buildCellColors(image, pixelMask, [[true]], 1, 1)

    expect(colors[0][0]).toBe('#aa0055')
  })

  it('falls back to all covered pixels when a kept cell has no kept pixels', () => {
    const image = makeImage(2, 2, () => [0, 128, 0, 255])
    const pixelMask = { data: new Uint8Array([0, 0, 0, 0]), height: 2, width: 2 }
    const colors = buildCellColors(image, pixelMask, [[true]], 1, 1)

    expect(colors[0][0]).toBe('#008000')
  })

  it('wand-removes the connected cells of similar color only', () => {
    // 4x4 image -> 2x2 cells: left cells red, right cells blue, all kept.
    const image = makeImage(4, 4, x => (x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]))
    const pixelMask = { data: new Uint8Array(16).fill(1), height: 4, width: 4 }
    const cellMask = [[true, true], [true, true]]
    const removed = removeSimilarCells(image, pixelMask, cellMask, 0, 0, 30)

    expect(removed).toBe(2)
    // Left cells' pixels cleared, right cells untouched.
    expect([...pixelMask.data]).toEqual([
      0,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
    ])
  })

  it('wand compares cells against the clicked seed cell, not neighbors', () => {
    // 4x1 cells with gray averages 100, 120, 140, 160. Tolerance 25 from
    // the seed reaches 120 but not 140, even though each step is only 20.
    const grays = [100, 120, 140, 160]
    const image = makeImage(4, 1, x => [grays[x], grays[x], grays[x], 255])
    const pixelMask = { data: new Uint8Array([1, 1, 1, 1]), height: 1, width: 4 }
    const cellMask = [[true, true, true, true]]
    const removed = removeSimilarCells(image, pixelMask, cellMask, 0, 0, 25)

    expect(removed).toBe(2)
    expect([...pixelMask.data]).toEqual([0, 0, 1, 1])
  })

  it('wand does not cross removed cells and ignores removed seeds', () => {
    // Same color everywhere, but the middle cell is already removed, so the
    // fill cannot reach the right cell.
    const image = makeImage(3, 1, () => [50, 50, 50, 255])
    const pixelMask = { data: new Uint8Array([1, 0, 1]), height: 1, width: 3 }
    const cellMask = [[true, false, true]]

    expect(removeSimilarCells(image, pixelMask, cellMask, 0, 0, 30)).toBe(1)
    expect([...pixelMask.data]).toEqual([0, 0, 1])
    expect(removeSimilarCells(image, pixelMask, cellMask, 1, 0, 30)).toBe(0)
  })
})
