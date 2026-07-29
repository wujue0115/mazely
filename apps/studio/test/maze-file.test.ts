import type { Maze } from 'mazely'
import { createMaze } from 'mazely'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FLOOD_THEME } from '../src/lib/flood'
import {
  decodeMazeFile,
  encodeMazeFile,
  MazeFileError,
} from '../src/lib/maze-file'
import { DEFAULT_STYLE_THEME, DEFAULT_STYLE_VISIBILITY } from '../src/lib/types'

const appearance = {
  floorTheme: DEFAULT_FLOOD_THEME,
  showShapeColors: true,
  styleTheme: { ...DEFAULT_STYLE_THEME },
  visibleElements: { ...DEFAULT_STYLE_VISIBILITY },
  wallHeightPx: 14,
  wallThickness: 2,
}

describe('.maze v1 codec', () => {
  it('round-trips a generated square maze with bit-packed links', async () => {
    const runtime = createMaze({ grid: { cols: 3, rows: 2, type: 'square' } })
    runtime.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, true)
    runtime.setEdgeOpenedBetween({ x: 1, y: 0 }, { x: 1, y: 1 }, true)

    const encoded = await encodeMazeFile({
      appearance,
      hasCustomStartAndEndPoints: false,
      maze: {
        algorithm: 'dfs',
        cols: 3,
        end: { x: 2, y: 1 },
        rows: 2,
        start: { x: 0, y: 0 },
      },
      runtime,
      shape: null,
      solve: {
        algorithm: 'a-star',
        head: { x: 0, y: 0 },
        path: [],
        status: 'running',
        visited: {},
      },
    })
    const loaded = await decodeMazeFile(encoded)

    expect(new TextDecoder().decode(encoded.subarray(0, 4))).toBe('MZLY')
    expect(encoded[4]).toBe(1)
    expect(loaded.maze).toEqual({
      algorithm: 'dfs',
      cols: 3,
      end: { x: 2, y: 1 },
      rows: 2,
      start: { x: 0, y: 0 },
    })
    expect(loaded.solve.status).toBe('generated')
    expect(openedEdgeIds(loaded.runtime)).toEqual(openedEdgeIds(runtime))
  })

  it('round-trips a solved masked maze, solve state, and cell colors', async () => {
    const mask = [
      [true, true, true],
      [false, false, true],
    ]
    const runtime = createMaze({ grid: { cols: 3, mask, rows: 2, type: 'square' } })
    runtime.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, true)
    runtime.setEdgeOpenedBetween({ x: 1, y: 0 }, { x: 2, y: 0 }, true)
    runtime.setEdgeOpenedBetween({ x: 2, y: 0 }, { x: 2, y: 1 }, true)
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ]

    const encoded = await encodeMazeFile({
      appearance: {
        ...appearance,
        wallThickness: 3.5,
      },
      hasCustomStartAndEndPoints: true,
      maze: {
        algorithm: 'prim',
        cols: 3,
        end: { x: 2, y: 1 },
        rows: 2,
        start: { x: 0, y: 0 },
      },
      runtime,
      shape: {
        cellColors: [
          ['#112233', '#445566', '#778899'],
          [null, null, '#abcdef'],
        ],
        cellMask: mask,
        cols: 3,
        end: { x: 2, y: 1 },
        rows: 2,
        start: { x: 0, y: 0 },
      },
      solve: {
        algorithm: 'bfs',
        head: { x: 2, y: 1 },
        path,
        status: 'solved',
        visited: Object.fromEntries(path.map(point => [`${point.x},${point.y}`, true])),
      },
    })
    const loaded = await decodeMazeFile(encoded)

    expect(loaded.solve).toMatchObject({
      algorithm: 'bfs',
      head: { x: 2, y: 1 },
      path,
      status: 'solved',
    })
    expect(loaded.solve.visited).toEqual({
      '0,0': true,
      '1,0': true,
      '2,0': true,
      '2,1': true,
    })
    expect(loaded.shape?.cellMask).toEqual(mask)
    expect(loaded.shape?.cellColors).toEqual([
      ['#112233', '#445566', '#778899'],
      [null, null, '#abcdef'],
    ])
    expect(loaded.appearance?.wallThickness).toBe(3.5)
    expect(loaded.appearance?.styleTheme.unlinkedCell).toBe(DEFAULT_STYLE_THEME.unlinkedCell)
    expect(openedEdgeIds(loaded.runtime)).toEqual(openedEdgeIds(runtime))
  })

  it('round-trips a completed flood without an end path', async () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 2, type: 'square' } })
    runtime.openAllEdges()
    const visited = {
      '0,0': true,
      '0,1': true,
      '1,0': true,
      '1,1': true,
    } as const

    const encoded = await encodeMazeFile({
      appearance,
      hasCustomStartAndEndPoints: false,
      maze: {
        algorithm: 'dfs',
        cols: 2,
        end: { x: 1, y: 1 },
        rows: 2,
        start: { x: 0, y: 0 },
      },
      runtime,
      shape: null,
      solve: {
        algorithm: 'flood',
        head: null,
        path: [],
        status: 'solved',
        visited,
      },
    })
    const loaded = await decodeMazeFile(encoded)

    expect(loaded.solve).toEqual({
      algorithm: 'flood',
      head: null,
      path: [],
      status: 'solved',
      visited,
    })
  })

  it('maps legacy road appearance fields to cell and sub path fields', async () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })
    const { floorTheme: _floorTheme, ...legacyAppearance } = appearance
    const legacyTheme = {
      ...DEFAULT_STYLE_THEME,
      road: '#123456',
      unlinked: '#654321',
    } as Record<string, string>
    const legacyVisibility = {
      ...DEFAULT_STYLE_VISIBILITY,
      road: false,
      unlinked: true,
    } as Record<string, boolean>
    delete legacyTheme.cell
    delete legacyTheme.subPath
    delete legacyTheme.unlinkedCell
    delete legacyVisibility.cell
    delete legacyVisibility.subPath
    delete legacyVisibility.unlinkedCell

    const encoded = await encodeMazeFile({
      appearance: {
        ...legacyAppearance,
        styleTheme: legacyTheme,
        visibleElements: legacyVisibility,
      } as unknown as typeof appearance,
      hasCustomStartAndEndPoints: false,
      maze: {
        algorithm: 'dfs',
        cols: 2,
        end: { x: 1, y: 0 },
        rows: 1,
        start: { x: 0, y: 0 },
      },
      runtime,
      shape: null,
      solve: {
        algorithm: 'dfs',
        head: null,
        path: [],
        status: 'running',
        visited: {},
      },
    })
    const loaded = await decodeMazeFile(encoded)

    expect(loaded.appearance?.styleTheme).toMatchObject({
      cell: '#123456',
      subPath: '#123456',
      unlinkedCell: '#654321',
    })
    expect(loaded.appearance?.visibleElements).toMatchObject({
      cell: false,
      subPath: false,
      unlinkedCell: true,
    })
    expect(loaded.appearance?.floorTheme).toBe(DEFAULT_FLOOD_THEME)
  })

  it('rejects a partially solved maze', async () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })

    await expect(encodeMazeFile({
      appearance,
      hasCustomStartAndEndPoints: false,
      maze: {
        algorithm: 'dfs',
        cols: 2,
        end: { x: 1, y: 0 },
        rows: 1,
        start: { x: 0, y: 0 },
      },
      runtime,
      shape: null,
      solve: {
        algorithm: 'dfs',
        head: { x: 0, y: 0 },
        path: [],
        status: 'running',
        visited: { '0,0': true },
      },
    })).rejects.toThrow('partially solved')
  })

  it('rejects a damaged compressed payload', async () => {
    const runtime = createMaze({ grid: { cols: 1, rows: 1, type: 'square' } })
    const encoded = await encodeMazeFile({
      appearance,
      hasCustomStartAndEndPoints: false,
      maze: {
        algorithm: 'dfs',
        cols: 1,
        end: { x: 0, y: 0 },
        rows: 1,
        start: { x: 0, y: 0 },
      },
      runtime,
      shape: null,
      solve: {
        algorithm: 'dfs',
        head: null,
        path: [],
        status: 'running',
        visited: {},
      },
    })
    encoded[encoded.length - 1] ^= 0xFF

    await expect(decodeMazeFile(encoded)).rejects.toBeInstanceOf(MazeFileError)
  })
})

function openedEdgeIds(runtime: Maze): string[] {
  return runtime.grid.edges.filter(edge => edge.opened).map(edge => edge.id)
}
