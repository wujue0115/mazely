import type { Maze } from 'mazely'
import { createMaze } from 'mazely'
import { describe, expect, it } from 'vitest'
import { getCellCenter, getOverlayScale, getViewportRatioRows, hitTestCell, TRIANGLE_OVERLAY_SCALE } from '../src/lib/grid-geometry'
import {
  countGridLines,
  hasOpenCellEdge,
  visitReferenceGridLines,
} from '../src/lib/runtime'

describe('square grid reference lines', () => {
  it('fits square rows to the viewport aspect ratio', () => {
    expect(getViewportRatioRows(100, 0.5, 'square')).toBe(50)
  })

  it('visits each full-grid cell boundary exactly once', () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 2, type: 'square' } })
    const lines = collectLines(runtime)

    expect(countGridLines(runtime)).toBe(12)
    expect(lines).toHaveLength(12)
    expect(new Set(lines).size).toBe(lines.length)
    expect(lines).toContain('0,0>1,0')
    expect(lines).toContain('1,1>2,1')
    expect(lines).toContain('0,2>1,2')
  })

  it('includes shape-mask boundaries without duplicate lines', () => {
    const runtime = createMaze({
      grid: {
        cols: 2,
        mask: [
          [true, false],
          [false, true],
        ],
        rows: 2,
        type: 'square',
      },
    })
    const lines = collectLines(runtime)

    expect(lines).toHaveLength(8)
    expect(new Set(lines).size).toBe(lines.length)
  })

  it('distinguishes an unlinked cell from a linked cell', () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })

    expect(hasOpenCellEdge(runtime, 0, 0)).toBe(false)
    expect(hasOpenCellEdge(runtime, 1, 0)).toBe(false)

    runtime.openAllEdges()

    expect(hasOpenCellEdge(runtime, 0, 0)).toBe(true)
    expect(hasOpenCellEdge(runtime, 1, 0)).toBe(true)
  })
})

describe('triangle grid reference lines', () => {
  it('fits rectangular triangle rows using triangular world dimensions', () => {
    expect(getViewportRatioRows(100, 0.5, 'triangle')).toBe(29)
  })

  it('visits each triangular boundary exactly once', () => {
    const runtime = createMaze({ grid: { layout: 'triangle', size: 4, type: 'triangle' } })
    const lines = collectLines(runtime)

    expect(runtime.grid.cells).toHaveLength(16)
    expect(runtime.grid.edges).toHaveLength(18)
    expect(lines).toHaveLength(30)
    expect(new Set(lines).size).toBe(lines.length)
  })

  it('hit-tests offset cells in a triangular outer boundary', () => {
    const runtime = createMaze({ grid: { layout: 'triangle', size: 4, type: 'triangle' } })
    const topCell = runtime.grid.getCell('0:0')!
    const bottomCell = runtime.grid.getCell('3:6')!

    expect(hitTestCell(runtime, getCellCenter(topCell))?.id).toBe(topCell.id)
    expect(hitTestCell(runtime, getCellCenter(bottomCell))?.id).toBe(bottomCell.id)
  })

  it('hit-tests a masked row when its first triangle cell is excluded', () => {
    const mask = Array.from({ length: 10 }, (_, row) =>
      Array.from({ length: row * 2 + 1 }, () => true))
    mask[1][0] = false
    const runtime = createMaze({
      grid: { layout: 'triangle', mask, size: 10, type: 'triangle' },
    })
    const cell = runtime.grid.getCell('1:2')!

    expect(hitTestCell(runtime, getCellCenter(cell))?.id).toBe(cell.id)
  })

  it('supports a rectangular rows-by-columns triangle grid', () => {
    const runtime = createMaze({
      grid: { cols: 3, layout: 'rectangle', rows: 4, type: 'triangle' },
    })
    const lines = collectLines(runtime)

    expect(runtime.grid.cells).toHaveLength(12)
    expect(runtime.grid.edges).toHaveLength(13)
    expect(lines).toHaveLength(23)
    expect(new Set(lines).size).toBe(lines.length)
  })
})

describe('hexagon grid reference lines', () => {
  it('matches triangular overlay weight', () => {
    const runtime = createMaze({ grid: { layout: 'hexagon', size: 2, type: 'hexagon' } })
    expect(getOverlayScale(runtime)).toBe(TRIANGLE_OVERLAY_SCALE)
  })

  it.each(['pointy', 'flat'] as const)('renders and hit-tests %s hex cells', (orientation) => {
    const runtime = createMaze({
      grid: { cols: 3, layout: 'rectangle', orientation, rows: 3, type: 'hexagon' },
    })
    const center = runtime.grid.getCell('1:1')!
    const lines = collectLines(runtime)

    expect(hitTestCell(runtime, getCellCenter(center))?.id).toBe(center.id)
    expect(lines).toHaveLength(runtime.grid.cells.length * 6 - runtime.grid.edges.length)
    expect(new Set(lines).size).toBe(lines.length)
  })

  it('renders the complete boundary of a hexagonal outer layout', () => {
    const runtime = createMaze({
      grid: { layout: 'hexagon', size: 3, type: 'hexagon' },
    })

    expect(runtime.grid.cells).toHaveLength(19)
    expect(collectLines(runtime)).toHaveLength(runtime.grid.cells.length * 6 - runtime.grid.edges.length)
  })
})

function collectLines(runtime: Maze): string[] {
  const lines: string[] = []
  visitReferenceGridLines(runtime, (fromX, fromY, toX, toY) => {
    lines.push(`${fromX},${fromY}>${toX},${toY}`)
  })
  return lines
}
