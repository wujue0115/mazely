import type { Maze } from 'mazely'
import { createMaze } from 'mazely'
import { describe, expect, it } from 'vitest'
import {
  countSquareGridLines,
  hasOpenCellEdge,
  visitSquareGridLines,
} from '../src/lib/runtime'

describe('square grid reference lines', () => {
  it('visits each full-grid cell boundary exactly once', () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 2, type: 'square' } })
    const lines = collectLines(runtime)

    expect(countSquareGridLines(runtime)).toBe(12)
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

function collectLines(runtime: Maze): string[] {
  const lines: string[] = []
  visitSquareGridLines(runtime, (fromX, fromY, toX, toY) => {
    lines.push(`${fromX},${fromY}>${toX},${toY}`)
  })
  return lines
}
