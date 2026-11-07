import { createMaze } from 'mazely'
import { describe, expect, it } from 'vitest'
import { getCellCenter, getNearestCellEdge, getSharedBoundaries, hitTestCell } from '../src/lib/grid-geometry'

const point = (radius: number, angle: number) => ({ x: 5 + radius * Math.cos(angle), y: 5 + radius * Math.sin(angle) })

describe('circular editing geometry', () => {
  it('returns the whole split arc for edit highlighting', () => {
    const runtime = createMaze({ grid: { rings: 5, type: 'circular' } })
    const parent = runtime.grid.getCell('1:0')!
    const child = runtime.grid.getCell('2:0')!
    const segments = getSharedBoundaries(parent, child)
    expect(segments.length).toBeGreaterThan(1)
    expect(segments[0].from).toEqual({ x: 7, y: 5 })
    const end = segments.at(-1)!.to
    expect(Math.atan2(end.y - 5, end.x - 5)).toBeCloseTo(Math.PI / 6)
    for (let index = 1; index < segments.length; index += 1) expect(segments[index].from).toEqual(segments[index - 1].to)
    expect(getSharedBoundaries(parent, runtime.grid.getCell('2:5')!)).toEqual([])
  })

  it('selects every cell by its center and rejects points outside the disk', () => {
    const runtime = createMaze({ grid: { rings: 5, type: 'circular' } })
    for (const cell of runtime.grid.cells) {
      expect(hitTestCell(runtime, getCellCenter(cell))?.id).toBe(cell.id)
    }
    expect(hitTestCell(runtime, { x: 0, y: 0 })).toBeNull()
    expect(hitTestCell(runtime, point(5.01, 0))).toBeNull()
  })

  it('distinguishes cells on both sides of the angular seam', () => {
    const runtime = createMaze({ grid: { rings: 5, type: 'circular' } })
    expect(hitTestCell(runtime, point(1.5, 0.001))?.id).toBe('1:0')
    expect(hitTestCell(runtime, point(1.5, -0.001))?.id).toBe('1:5')
  })

  it('opens split arc walls independently and can close them again', () => {
    const runtime = createMaze({ grid: { rings: 5, type: 'circular' } })
    const cell = runtime.grid.getCell('1:0')!
    const first = getNearestCellEdge(cell, point(1.999, Math.PI / 12))!
    const second = getNearestCellEdge(cell, point(1.999, Math.PI / 4))!
    expect(first.getOther(cell)?.id).toBe('2:0')
    expect(second.getOther(cell)?.id).toBe('2:1')
    runtime.setEdgeOpenedBetween({ x: cell.col, y: cell.row }, { x: 0, y: 2 }, true)
    expect(first.opened).toBe(true)
    expect(second.opened).toBe(false)
    runtime.setEdgeOpenedBetween({ x: cell.col, y: cell.row }, { x: 0, y: 2 }, false)
    expect(first.opened).toBe(false)
  })

  it('selects the shared radial wall across the angular seam', () => {
    const runtime = createMaze({ grid: { rings: 5, type: 'circular' } })
    const cell = runtime.grid.getCell('1:0')!
    expect(getNearestCellEdge(cell, point(1.5, 0.001))?.getOther(cell)?.id).toBe('1:5')
  })
})
