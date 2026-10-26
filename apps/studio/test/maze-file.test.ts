import type { Maze } from 'mazely'
import { Buffer } from 'node:buffer'
import { crc32, gunzipSync, gzipSync } from 'node:zlib'
import { buildRingCellCounts, createMaze } from 'mazely'
import { describe, expect, it } from 'vitest'
import { DEFAULT_FLOOD_THEME } from '../src/lib/flood'
import {
  createMazeFilename,
  decodeMazeFile,
  encodeMazeFile,
  MazeFileError,
} from '../src/lib/maze-file'
import { DEFAULT_STYLE_THEME, DEFAULT_STYLE_VISIBILITY } from '../src/lib/types'
import { CIRCULAR_RING_MAX } from '../src/lib/utils'

const appearance = {
  floorTheme: DEFAULT_FLOOD_THEME,
  showShapeColors: true,
  styleTheme: { ...DEFAULT_STYLE_THEME },
  visibleElements: { ...DEFAULT_STYLE_VISIBILITY },
  wallHeightPx: 14,
  wallThickness: 2,
}

const pointPreferences = {
  generateManualStart: { x: 0, y: 0 },
  generateMode: 'auto',
  solveManualEnd: { x: 0, y: 0 },
  solveManualStart: { x: 0, y: 0 },
  solveMode: 'auto',
} as const

describe('.maze v1 codec', () => {
  it.each([false, true])('preserves a topology-only circular mask when regenerating (legacy flag: %s)', async (legacy) => {
    const runtime = createMaze({ grid: { rings: 3, type: 'circular', mask: [[false], [true], [true]] } })
    runtime.generate('dfs').finish()
    const start = { x: 0, y: 1 }
    const end = { x: 0, y: 2 }
    let file = await encodeMazeFile({
      runtime,
      appearance,
      shape: null,
      pointPreferences: { ...pointPreferences, generateManualStart: start, solveManualStart: start, solveManualEnd: end },
      maze: { algorithm: 'dfs', rows: 3, cols: runtime.grid.cols, start, end },
      solve: { algorithm: 'bfs', status: 'idle', path: [], head: null, visited: {} },
    })
    const payload = gunzipSync(file.subarray(16))
    expect(payload.toString('latin1')).toContain('"hasShape":true')
    if (legacy) {
      // Recreate the old contradictory metadata without altering chunk sizes.
      const oldPayload = Buffer.from(payload.toString('latin1')
        .replace('"hasShape":true', '"hasShape":false')
        .replace('"hasCustomStartAndEndPoints":false', '"hasCustomStartAndEndPoints":true'), 'latin1')
      expect(oldPayload.length).toBe(payload.length)
      const compressed = gzipSync(oldPayload)
      const oldFile = new Uint8Array(16 + compressed.length)
      oldFile.set(file.subarray(0, 16))
      new DataView(oldFile.buffer).setUint32(12, crc32(oldPayload), true)
      oldFile.set(compressed, 16)
      file = oldFile
    }
    const loaded = await decodeMazeFile(file)
    expect(loaded.shape).not.toBeNull()
    expect(loaded.shape!.cellMask[0][0]).toBe(false)
    const regenerated = createMaze({ grid: { rings: loaded.maze.rows, type: 'circular', mask: loaded.shape!.cellMask } })
    regenerated.generate('dfs').finish()
    expect(regenerated.grid.cells.map(cell => cell.id)).toEqual(runtime.grid.cells.map(cell => cell.id))
    regenerated.solve('bfs', { start, end }).finish()
    expect(regenerated.getSolveResult()?.solved).toBe(true)
  })

  it('rejects oversized circular saves before enumerating the full topology', async () => {
    const runtime = createMaze({ grid: { rings: CIRCULAR_RING_MAX + 1, mask: [[true]], type: 'circular' } })
    await expect(encodeMazeFile({
      runtime,
      appearance,
      pointPreferences,
      shape: null,
      maze: { algorithm: 'dfs', rows: runtime.grid.rows, cols: runtime.grid.cols, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      solve: { algorithm: 'bfs', status: 'idle', path: [], head: null, visited: {} },
    })).rejects.toThrow('up to 128 rings')
  })

  it('rejects oversized circular files before requiring links or allocating a grid', async () => {
    const meta = new Uint8Array([1, ...new TextEncoder().encode(JSON.stringify({ generationAlgorithm: 'dfs', hasCustomStartAndEndPoints: false }))])
    // A valid header/CRC and topology declaring 129 rings, without LINKS.
    const topology = [3, 1, 0x81, 0x01, 0]
    const payload = new Uint8Array([1, meta.length, ...meta, 2, topology.length, ...topology])
    const file = new Uint8Array(16 + payload.length)
    file.set([0x4D, 0x5A, 0x4C, 0x59, 1, 0, 0, 0])
    const header = new DataView(file.buffer)
    header.setUint32(8, payload.length, true)
    header.setUint32(12, crc32(payload), true)
    file.set(payload, 16)
    await expect(decodeMazeFile(file)).rejects.toThrow('between 1 and 128')
  })

  it('accepts the Studio circular size boundary with a sparse shape', async () => {
    const runtime = createMaze({ grid: { rings: CIRCULAR_RING_MAX, mask: [[true]], type: 'circular' } })
    const encoded = await encodeMazeFile({
      runtime,
      appearance,
      pointPreferences,
      shape: null,
      maze: { algorithm: 'dfs', rows: runtime.grid.rows, cols: runtime.grid.cols, start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
      solve: { algorithm: 'bfs', status: 'idle', path: [], head: null, visited: {} },
    })
    const loaded = await decodeMazeFile(encoded)
    expect(loaded.runtime.grid.rows).toBe(CIRCULAR_RING_MAX)
    expect(loaded.runtime.grid.cells).toHaveLength(1)
  })

  it('round-trips circular image masks, colors, and a removed center', async () => {
    const counts = buildRingCellCounts(4)
    const mask = counts.map((count, row) => Array.from({ length: count }, (_, col) => row > 0 && col !== 2))
    const runtime = createMaze({ grid: { rings: 4, mask, type: 'circular' }, seed: 'masked-circle-file' })
    runtime.generate('sidewinder').finish()
    const shape = {
      cellMask: mask,
      cellColors: mask.map(row => row.map(active => active ? '#ff0000' : null)),
      cols: runtime.grid.cols,
      rows: 4,
      start: { x: 0, y: 1 },
      end: { x: 0, y: 3 },
    }
    const encoded = await encodeMazeFile({
      appearance,
      pointPreferences: { ...pointPreferences, generateManualStart: shape.start, solveManualStart: shape.start, solveManualEnd: shape.end },
      runtime,
      shape,
      maze: { algorithm: 'sidewinder', cols: runtime.grid.cols, rows: 4, start: shape.start, end: shape.end },
      solve: { algorithm: 'a-star', head: null, path: [], status: 'idle', visited: {} },
    })
    const loaded = await decodeMazeFile(encoded)
    expect(loaded.runtime.grid.cells.map(cell => cell.id)).toEqual(runtime.grid.cells.map(cell => cell.id))
    expect(loaded.runtime.grid.edges.map(edge => [edge.id, edge.opened])).toEqual(runtime.grid.edges.map(edge => [edge.id, edge.opened]))
    for (const cell of runtime.grid.cells) {
      expect(loaded.shape?.cellColors[cell.row][cell.col]).toBe('#ff0000')
      expect(loaded.shape?.cellMask[cell.row][cell.col]).toBe(true)
    }
    expect(loaded.shape?.cellMask[0][0]).toBe(false)
    expect(loaded.runtime.grid.getCell('0:0')).toBeUndefined()
  })

  it.each([1, 5, 12])('round-trips circular topology and links with %i rings', async (rings) => {
    const runtime = createMaze({ grid: { rings, type: 'circular' }, seed: 'circular-file' })
    runtime.generate('dfs').finish()
    const last = runtime.grid.cells.at(-1)!
    const end = { x: last.col, y: last.row }
    const encoded = await encodeMazeFile({
      appearance,
      pointPreferences,
      runtime,
      shape: null,
      maze: { algorithm: 'dfs', cols: runtime.grid.cols, rows: rings, start: { x: 0, y: 0 }, end },
      solve: { algorithm: 'a-star', head: null, path: [], status: 'idle', visited: {} },
    })
    const loaded = await decodeMazeFile(encoded)
    expect(loaded.runtime.grid.type).toBe('circular')
    expect(loaded.runtime.grid.cells.map(cell => cell.id)).toEqual(runtime.grid.cells.map(cell => cell.id))
    expect(loaded.runtime.grid.edges.map(edge => [edge.id, edge.opened])).toEqual(runtime.grid.edges.map(edge => [edge.id, edge.opened]))
    expect(loaded.maze.end).toEqual(end)
    expect(loaded.shape).toBeNull()
  })

  it.each([
    {
      expected: 'mazely-20260830090507-square-12x8.maze',
      runtime: createMaze({ grid: { cols: 12, rows: 8, type: 'square' } }),
    },
    {
      expected: 'mazely-20260830090507-triangle-12x8.maze',
      runtime: createMaze({
        grid: { cols: 12, layout: 'rectangle', rows: 8, type: 'triangle' },
      }),
    },
    {
      expected: 'mazely-20260830090507-triangle-12.maze',
      runtime: createMaze({ grid: { layout: 'triangle', size: 12, type: 'triangle' } }),
    },
    {
      expected: 'mazely-20260830090507-hexagon-7x7.maze',
      runtime: createMaze({ grid: { layout: 'hexagon', orientation: 'flat', size: 4, type: 'hexagon' } }),
    },
  ])('includes timestamp, topology, and dimensions in $expected', ({ expected, runtime }) => {
    const date = new Date(2026, 7, 30, 9, 5, 7)

    expect(createMazeFilename(runtime, date)).toBe(expected)
  })

  it('round-trips a generated square maze with bit-packed links', async () => {
    const runtime = createMaze({ grid: { cols: 3, rows: 2, type: 'square' } })
    runtime.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, true)
    runtime.setEdgeOpenedBetween({ x: 1, y: 0 }, { x: 1, y: 1 }, true)

    const encoded = await encodeMazeFile({
      appearance,
      pointPreferences: {
        ...pointPreferences,
        generateMode: 'manual',
        solveManualEnd: { x: 2, y: 1 },
      },
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
    expect(encoded[5]).toBe(0)
    expect(loaded.maze).toEqual({
      algorithm: 'dfs',
      cols: 3,
      end: { x: 2, y: 1 },
      rows: 2,
      start: { x: 0, y: 0 },
    })
    expect(loaded.solve.status).toBe('generated')
    expect(loaded.pointPreferences).toMatchObject({
      generateMode: 'manual',
      solveMode: 'auto',
    })
    expect(openedEdgeIds(loaded.runtime)).toEqual(openedEdgeIds(runtime))

    const futureVersion = encoded.slice()
    futureVersion[5] = 1
    await expect(decodeMazeFile(futureVersion)).rejects.toThrow('Unsupported .maze version 1.1')
  })

  it('round-trips a solved triangle outer layout and its diagonal path', async () => {
    const runtime = createMaze({ grid: { layout: 'triangle', size: 3, type: 'triangle' } })
    runtime.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 1 }, true)
    runtime.setEdgeOpenedBetween({ x: 1, y: 1 }, { x: 2, y: 1 }, true)
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]

    const encoded = await encodeMazeFile({
      appearance,
      pointPreferences: {
        ...pointPreferences,
        solveManualEnd: { x: 2, y: 1 },
      },
      maze: {
        algorithm: 'dfs',
        cols: 5,
        end: { x: 2, y: 1 },
        rows: 3,
        start: { x: 0, y: 0 },
      },
      runtime,
      shape: null,
      solve: {
        algorithm: 'dfs',
        head: { x: 2, y: 1 },
        path,
        status: 'solved',
        visited: Object.fromEntries(path.map(point => [`${point.x},${point.y}`, true])),
      },
    })
    const loaded = await decodeMazeFile(encoded)

    expect(loaded.runtime.grid).toMatchObject({
      cols: 5,
      layout: 'triangle',
      rows: 3,
      size: 3,
      type: 'triangle',
    })
    expect(loaded.solve.path).toEqual(path)
    expect(openedEdgeIds(loaded.runtime)).toEqual(openedEdgeIds(runtime))
  })

  it('round-trips a flat hexagonal outer layout and its links', async () => {
    const runtime = createMaze({ grid: { layout: 'hexagon', orientation: 'flat', size: 3, type: 'hexagon' } })
    runtime.generate('dfs').finish()
    const encoded = await encodeMazeFile({
      appearance,
      pointPreferences: {
        ...pointPreferences,
        generateManualStart: { x: 0, y: 2 },
        solveManualEnd: { x: 4, y: 2 },
        solveManualStart: { x: 0, y: 2 },
      },
      maze: { algorithm: 'dfs', cols: 5, end: { x: 4, y: 2 }, rows: 5, start: { x: 0, y: 2 } },
      runtime,
      shape: null,
      solve: { algorithm: 'bfs', head: null, path: [], status: 'idle', visited: {} },
    })
    const loaded = await decodeMazeFile(encoded)

    expect(loaded.runtime.grid).toMatchObject({ layout: 'hexagon', orientation: 'flat', size: 3, type: 'hexagon' })
    expect(openedEdgeIds(loaded.runtime).sort()).toEqual(openedEdgeIds(runtime).sort())
  })

  it('preserves triangle links when the runtime edge array order changes', async () => {
    const runtime = createMaze({
      grid: { cols: 4, layout: 'rectangle', rows: 3, type: 'triangle' },
    })
    runtime.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 0, y: 1 }, true)
    runtime.setEdgeOpenedBetween({ x: 2, y: 0 }, { x: 3, y: 0 }, true)
    runtime.setEdgeOpenedBetween({ x: 1, y: 1 }, { x: 2, y: 1 }, true)
    runtime.setEdgeOpenedBetween({ x: 3, y: 1 }, { x: 3, y: 2 }, true)
    const expectedOpenedEdges = [...openedEdgeIds(runtime)].sort()

    runtime.grid.edges.reverse()
    const encoded = await encodeMazeFile({
      appearance,
      pointPreferences: {
        ...pointPreferences,
        solveManualEnd: { x: 3, y: 2 },
      },
      maze: {
        algorithm: 'dfs',
        cols: 4,
        end: { x: 3, y: 2 },
        rows: 3,
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

    expect(openedEdgeIds(loaded.runtime).sort()).toEqual(expectedOpenedEdges)
  })

  it('uses canonical links for a triangular outer layout', async () => {
    const runtime = createMaze({ grid: { layout: 'triangle', size: 4, type: 'triangle' } })
    runtime.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 1 }, true)
    runtime.setEdgeOpenedBetween({ x: 1, y: 1 }, { x: 2, y: 1 }, true)
    runtime.setEdgeOpenedBetween({ x: 2, y: 1 }, { x: 3, y: 2 }, true)
    runtime.setEdgeOpenedBetween({ x: 3, y: 2 }, { x: 4, y: 2 }, true)
    const expectedOpenedEdges = [...openedEdgeIds(runtime)].sort()

    runtime.grid.edges.reverse()
    const encoded = await encodeMazeFile({
      appearance,
      pointPreferences: {
        ...pointPreferences,
        solveManualEnd: { x: 6, y: 3 },
      },
      maze: {
        algorithm: 'dfs',
        cols: 7,
        end: { x: 6, y: 3 },
        rows: 4,
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

    expect(openedEdgeIds(loaded.runtime).sort()).toEqual(expectedOpenedEdges)
  })

  it.each([250, 251, 500])('round-trips a triangle outer layout with size %i', async (size) => {
    const runtime = createMaze({ grid: { layout: 'triangle', size, type: 'triangle' } })
    const end = { x: size * 2 - 2, y: size - 1 }
    const encoded = await encodeMazeFile({
      appearance,
      pointPreferences: {
        ...pointPreferences,
        solveManualEnd: end,
      },
      maze: {
        algorithm: 'dfs',
        cols: size * 2 - 1,
        end,
        rows: size,
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

    expect(loaded.runtime.grid).toMatchObject({
      cols: size * 2 - 1,
      layout: 'triangle',
      rows: size,
      size,
      type: 'triangle',
    })
  })

  it.each([
    { grid: { cols: 501, rows: 1, type: 'square' } as const, label: 'square' },
    {
      grid: { cols: 501, layout: 'rectangle', rows: 1, type: 'triangle' } as const,
      label: 'rectangular triangle',
    },
  ])('keeps the 500-column limit for $label layouts', async ({ grid }) => {
    const runtime = createMaze({ grid })
    const encoded = await encodeMazeFile({
      appearance,
      pointPreferences: {
        ...pointPreferences,
        solveManualEnd: { x: 500, y: 0 },
      },
      maze: {
        algorithm: 'dfs',
        cols: 501,
        end: { x: 500, y: 0 },
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

    await expect(decodeMazeFile(encoded)).rejects.toThrow('Invalid')
  })

  it('round-trips a masked rectangular triangle layout and cell colors', async () => {
    const mask = [
      [true, true, true],
      [true, true, false],
    ]
    const runtime = createMaze({
      grid: { cols: 3, layout: 'rectangle', mask, rows: 2, type: 'triangle' },
    })
    runtime.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 0, y: 1 }, true)
    runtime.setEdgeOpenedBetween({ x: 0, y: 1 }, { x: 1, y: 1 }, true)

    const encoded = await encodeMazeFile({
      appearance,
      pointPreferences: {
        ...pointPreferences,
        solveManualEnd: { x: 1, y: 1 },
      },
      maze: {
        algorithm: 'prim',
        cols: 3,
        end: { x: 1, y: 1 },
        rows: 2,
        start: { x: 0, y: 0 },
      },
      runtime,
      shape: {
        cellColors: [
          ['#112233', '#445566', '#778899'],
          ['#abcdef', '#fedcba', null],
        ],
        cellMask: mask,
        cols: 3,
        end: { x: 1, y: 1 },
        rows: 2,
        start: { x: 0, y: 0 },
      },
      solve: {
        algorithm: 'bfs',
        head: null,
        path: [],
        status: 'running',
        visited: {},
      },
    })
    const loaded = await decodeMazeFile(encoded)

    expect(loaded.runtime.grid).toMatchObject({ layout: 'rectangle', type: 'triangle' })
    expect(loaded.shape).toMatchObject({
      cellColors: [
        ['#112233', '#445566', '#778899'],
        ['#abcdef', '#fedcba', null],
      ],
      cellMask: mask,
      cols: 3,
      rows: 2,
    })
    expect(openedEdgeIds(loaded.runtime)).toEqual(openedEdgeIds(runtime))
  })

  it.each([
    {
      cols: 2,
      createRuntime: () => createMaze({ grid: { cols: 2, rows: 2, type: 'square' } }),
      label: 'Square',
      rows: 2,
    },
    {
      cols: 3,
      createRuntime: () => createMaze({
        grid: { cols: 3, layout: 'rectangle', rows: 2, type: 'triangle' },
      }),
      label: 'Triangle',
      rows: 2,
    },
  ])('round-trips a full-cell $label image shape', async ({ cols, createRuntime, rows }) => {
    const runtime = createRuntime()
    const cellMask = Array.from({ length: rows }, () => Array.from({ length: cols }, () => true))
    const cellColors = Array.from(
      { length: rows },
      (_, row) => Array.from({ length: cols }, (_, col) => `#${row}${col}2233`),
    )
    const end = { x: cols - 1, y: rows - 1 }
    const encoded = await encodeMazeFile({
      appearance,
      pointPreferences: { ...pointPreferences, solveManualEnd: end },
      maze: {
        algorithm: 'dfs',
        cols,
        end,
        rows,
        start: { x: 0, y: 0 },
      },
      runtime,
      shape: {
        cellColors,
        cellMask,
        cols,
        end,
        rows,
        start: { x: 0, y: 0 },
      },
      solve: {
        algorithm: 'dfs',
        head: null,
        path: [],
        status: 'running',
        visited: {},
      },
    })

    const loaded = await decodeMazeFile(encoded)

    expect(loaded.shape).toMatchObject({ cellColors, cellMask, cols, rows })
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
      pointPreferences: {
        ...pointPreferences,
        generateMode: 'manual',
        solveManualEnd: { x: 2, y: 1 },
        solveMode: 'manual',
      },
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
    expect(loaded.pointPreferences).toEqual({
      generateManualStart: { x: 0, y: 0 },
      generateMode: 'manual',
      solveManualEnd: { x: 2, y: 1 },
      solveManualStart: { x: 0, y: 0 },
      solveMode: 'manual',
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
      pointPreferences: { ...pointPreferences, solveManualEnd: { x: 1, y: 1 } },
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

  it('round-trips a custom flood gradient', async () => {
    const runtime = createMaze({ grid: { cols: 1, rows: 1, type: 'square' } })
    const customFloodTheme = {
      curve: { x1: 0.2, x2: 0.8, y1: 0.1, y2: 0.9 },
      endColor: '#abcdef',
      loop: true,
      startColor: '#123456',
      totalPoints: 37,
      type: 'custom',
    } as const
    const encoded = await encodeMazeFile({
      appearance: {
        ...appearance,
        customFloodTheme,
        floorTheme: 'custom',
      },
      pointPreferences,
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
        algorithm: 'flood',
        head: null,
        path: [],
        status: 'running',
        visited: {},
      },
    })

    const loaded = await decodeMazeFile(encoded)
    expect(loaded.appearance?.floorTheme).toBe('custom')
    expect(loaded.appearance?.customFloodTheme).toEqual(customFloodTheme)
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
      pointPreferences,
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
      pointPreferences,
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
      pointPreferences,
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
