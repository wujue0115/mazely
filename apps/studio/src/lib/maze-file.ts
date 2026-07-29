import type { Maze, SquareCell } from 'mazely'
import type { AppliedShape } from './controllers/shape-editor'
import type { FloodTheme } from './flood'
import type {
  MazeGenerationAlgorithm,
  MazePoint,
  MazeSolvingAlgorithm,
  MazeViewState,
} from './maze-types'
import type { SolveState } from './solver-state'
import type { StyleTheme, StyleVisibility } from './types'
import {
  createMaze,
  isMazeGenerationAlgorithm,
  MAZE_SOLVING_ALGORITHMS,
} from 'mazely'
import { DEFAULT_FLOOD_THEME, isFloodTheme } from './flood'
import { key, parsePointKey } from './point'
import { DEFAULT_STYLE_THEME, DEFAULT_STYLE_VISIBILITY } from './types'

const MAGIC = new Uint8Array([0x4D, 0x5A, 0x4C, 0x59]) // MZLY
const HEADER_SIZE = 16
const VERSION_MAJOR = 1
const VERSION_MINOR = 0
const CODEC_NONE = 0
const CODEC_GZIP = 1
const TOPOLOGY_SQUARE = 0
const MAX_UNCOMPRESSED_SIZE = 64 * 1024 * 1024

const CHUNK_META = 1
const CHUNK_TOPOLOGY = 2
const CHUNK_LINKS = 3
const CHUNK_STATE = 4
const CHUNK_STYLE = 5
const CHUNK_CELL_COLORS = 6

export type MazeFileSolveStatus = 'generated' | 'solved' | 'unsolved'

export interface MazeFileAppearance {
  floorTheme: FloodTheme
  showShapeColors: boolean
  styleTheme: StyleTheme
  visibleElements: StyleVisibility
  wallHeightPx: number
  wallThickness: number
}

export interface MazeFileSaveOptions {
  appearance: MazeFileAppearance
  hasCustomStartAndEndPoints: boolean
  maze: MazeViewState
  runtime: Maze
  shape: AppliedShape | null
  solve: {
    algorithm: MazeSolvingAlgorithm
    head: MazePoint | null
    path: MazePoint[]
    status: SolveState['status']
    visited: Record<string, true>
  }
}

export interface LoadedMazeFile {
  appearance: MazeFileAppearance | null
  hasCustomStartAndEndPoints: boolean
  maze: MazeViewState
  runtime: Maze
  shape: AppliedShape | null
  solve: {
    algorithm: MazeSolvingAlgorithm
    head: MazePoint | null
    path: MazePoint[]
    status: MazeFileSolveStatus
    visited: Record<string, true>
  }
}

interface MazeFileMeta {
  generationAlgorithm: MazeGenerationAlgorithm
  hasCustomStartAndEndPoints: boolean
}

interface DecodedTopology {
  cols: number
  mask: boolean[][] | null
  rows: number
}

interface DecodedState {
  algorithm: MazeSolvingAlgorithm
  end: MazePoint
  head: MazePoint | null
  path: MazePoint[]
  start: MazePoint
  status: MazeFileSolveStatus
  visited: Record<string, true>
}

export async function encodeMazeFile(options: MazeFileSaveOptions): Promise<Uint8Array> {
  assertSaveOptions(options)

  const topology = encodeTopology(options.runtime)
  const links = encodeLinks(options.runtime)
  const state = encodeState(options)
  const chunks = [
    encodeChunk(CHUNK_META, encodeJson({
      generationAlgorithm: options.maze.algorithm,
      hasCustomStartAndEndPoints: options.hasCustomStartAndEndPoints,
    } satisfies MazeFileMeta)),
    encodeChunk(CHUNK_TOPOLOGY, topology),
    encodeChunk(CHUNK_LINKS, links),
    encodeChunk(CHUNK_STATE, state),
    encodeChunk(CHUNK_STYLE, encodeJson(encodeAppearance(options.appearance))),
  ]

  const colors = encodeCellColors(options.shape, options.maze.rows, options.maze.cols)
  if (colors) {
    chunks.push(encodeChunk(CHUNK_CELL_COLORS, colors))
  }

  const payload = concatBytes(chunks)
  const compressed = await gzip(payload)
  const output = new Uint8Array(HEADER_SIZE + compressed.length)
  output.set(MAGIC, 0)
  output[4] = VERSION_MAJOR
  output[5] = VERSION_MINOR
  output[6] = CODEC_GZIP
  output[7] = 0

  const header = new DataView(output.buffer)
  header.setUint32(8, payload.length, true)
  header.setUint32(12, crc32(payload), true)
  output.set(compressed, HEADER_SIZE)
  return output
}

export async function decodeMazeFile(file: ArrayBuffer | Uint8Array): Promise<LoadedMazeFile> {
  const source = file instanceof Uint8Array ? file : new Uint8Array(file)
  if (source.length < HEADER_SIZE || !MAGIC.every((value, index) => source[index] === value)) {
    throw new MazeFileError('This is not a Mazely .maze file.')
  }

  const major = source[4]
  if (major !== VERSION_MAJOR) {
    throw new MazeFileError(`Unsupported .maze version ${major}.${source[5]}.`)
  }

  const codec = source[6]
  const header = new DataView(source.buffer, source.byteOffset, HEADER_SIZE)
  const expectedSize = header.getUint32(8, true)
  if (expectedSize > MAX_UNCOMPRESSED_SIZE) {
    throw new MazeFileError('The .maze payload is too large.')
  }

  const compressed = source.subarray(HEADER_SIZE)
  const payload = codec === CODEC_GZIP
    ? await gunzip(compressed, expectedSize)
    : codec === CODEC_NONE
      ? compressed
      : throwUnsupportedCodec(codec)

  if (payload.length !== expectedSize) {
    throw new MazeFileError('The .maze payload size does not match its header.')
  }
  if (crc32(payload) !== header.getUint32(12, true)) {
    throw new MazeFileError('The .maze file is damaged or incomplete.')
  }

  const chunks = decodeChunks(payload)
  const meta = decodeMeta(requireChunk(chunks, CHUNK_META))
  const topology = decodeTopology(requireChunk(chunks, CHUNK_TOPOLOGY))
  const links = requireChunk(chunks, CHUNK_LINKS)
  const runtime = createRuntime(topology, links)
  const state = decodeState(requireChunk(chunks, CHUNK_STATE), topology, runtime)
  const appearanceChunk = chunks.get(CHUNK_STYLE)
  const appearance = appearanceChunk ? decodeAppearance(appearanceChunk) : null
  const colorsChunk = chunks.get(CHUNK_CELL_COLORS)
  const cellColors = colorsChunk ? decodeCellColors(colorsChunk, topology) : null
  const shape = topology.mask
    ? {
        cellColors: cellColors ?? topology.mask.map(row => row.map(() => null)),
        cellMask: topology.mask,
        cols: topology.cols,
        end: state.end,
        rows: topology.rows,
        start: state.start,
      }
    : null

  return {
    appearance,
    hasCustomStartAndEndPoints: meta.hasCustomStartAndEndPoints,
    maze: {
      algorithm: meta.generationAlgorithm,
      cols: topology.cols,
      end: state.end,
      rows: topology.rows,
      start: state.start,
    },
    runtime,
    shape,
    solve: {
      algorithm: state.algorithm,
      head: state.head,
      path: state.path,
      status: state.status,
      visited: state.visited,
    },
  }
}

export class MazeFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MazeFileError'
  }
}

function encodeTopology(runtime: Maze): Uint8Array {
  const { rows, cols } = runtime.grid
  const active = new Set(runtime.grid.cells.map(cell => slotFromCell(cell, cols)))
  const hasMask = active.size !== rows * cols
  const writer = new ByteWriter()
  writer.u8(TOPOLOGY_SQUARE)
  writer.varint(rows)
  writer.varint(cols)
  writer.u8(hasMask ? 1 : 0)
  if (hasMask) {
    writer.bytes(encodeBitset(rows * cols, slot => active.has(slot)))
  }
  return writer.finish()
}

function decodeTopology(bytes: Uint8Array): DecodedTopology {
  const reader = new ByteReader(bytes)
  const topology = reader.u8()
  if (topology !== TOPOLOGY_SQUARE) {
    throw new MazeFileError(`Unsupported maze topology codec ${topology}.`)
  }

  const rows = reader.varint()
  const cols = reader.varint()
  if (rows < 1 || cols < 1 || rows > 500 || cols > 500) {
    throw new MazeFileError(`Invalid square topology dimensions ${cols}x${rows}.`)
  }

  const flags = reader.u8()
  const mask = (flags & 1) !== 0
    ? decodeMask(reader.bytes(bitsetSize(rows * cols)), rows, cols)
    : null
  reader.done()

  if (mask && !mask.some(row => row.some(Boolean))) {
    throw new MazeFileError('The topology mask excludes every cell.')
  }
  return { cols, mask, rows }
}

function encodeLinks(runtime: Maze): Uint8Array {
  const { rows, cols } = runtime.grid
  const rightCount = rows * Math.max(cols - 1, 0)
  const linkCount = rightCount + Math.max(rows - 1, 0) * cols
  const opened = new Set<number>()

  for (const edge of runtime.grid.edges) {
    if (!edge.opened || !edge.to) {
      continue
    }
    const from = edge.from as SquareCell
    const to = edge.to as SquareCell
    if (from.row === to.row) {
      opened.add(from.row * (cols - 1) + Math.min(from.col, to.col))
    }
    else {
      opened.add(rightCount + Math.min(from.row, to.row) * cols + from.col)
    }
  }
  return encodeBitset(linkCount, index => opened.has(index))
}

function createRuntime(topology: DecodedTopology, links: Uint8Array): Maze {
  const rightCount = topology.rows * Math.max(topology.cols - 1, 0)
  const linkCount = rightCount + Math.max(topology.rows - 1, 0) * topology.cols
  if (links.length !== bitsetSize(linkCount)) {
    throw new MazeFileError('The LINKS chunk has an invalid length.')
  }

  const runtime = createMaze({
    grid: {
      cols: topology.cols,
      mask: topology.mask ?? undefined,
      rows: topology.rows,
      type: 'square',
    },
  })

  for (const edge of runtime.grid.edges) {
    const from = edge.from as SquareCell
    const to = edge.to as SquareCell
    const index = from.row === to.row
      ? from.row * (topology.cols - 1) + Math.min(from.col, to.col)
      : rightCount + Math.min(from.row, to.row) * topology.cols + from.col
    if (readBit(links, index)) {
      edge.open()
    }
  }
  return runtime
}

function encodeState(options: MazeFileSaveOptions): Uint8Array {
  const { rows, cols } = options.maze
  const slots = rows * cols
  const visitedSlots = new Set(
    Object.keys(options.solve.visited).map(pointKey => pointToSlot(parsePointKey(pointKey), rows, cols)),
  )
  const status = getFileSolveStatus(
    options.solve.algorithm,
    options.solve.status,
    visitedSlots.size,
    options.solve.path.length,
  )
  const writer = new ByteWriter()
  writer.u8(statusToByte(status))
  writer.u8(enumIndex(MAZE_SOLVING_ALGORITHMS, options.solve.algorithm, 'solving algorithm'))
  writer.varint(pointToSlot(options.maze.start, rows, cols))
  writer.varint(pointToSlot(options.maze.end, rows, cols))
  writer.bytes(encodeBitset(slots, slot => visitedSlots.has(slot)))

  writer.varint(options.solve.path.length)
  if (options.solve.path.length > 0) {
    writer.varint(pointToSlot(options.solve.path[0], rows, cols))
    writer.bytes(packTwoBitValues(
      options.solve.path.slice(1).map((point, index) =>
        directionBetween(options.solve.path[index], point)),
    ))
  }

  const head = options.solve.head
  writer.varint(head ? 1 : 0)
  if (head) {
    writer.varint(pointToSlot(head, rows, cols))
  }

  return writer.finish()
}

function decodeState(bytes: Uint8Array, topology: DecodedTopology, runtime: Maze): DecodedState {
  const reader = new ByteReader(bytes)
  const status = byteToStatus(reader.u8())
  const algorithm = enumValue(MAZE_SOLVING_ALGORITHMS, reader.u8(), 'solving algorithm')
  const slots = topology.rows * topology.cols
  const startSlot = reader.varint()
  const endSlot = reader.varint()
  const start = slotToPoint(startSlot, topology)
  const end = slotToPoint(endSlot, topology)
  assertActiveCell(runtime, start, 'start')
  assertActiveCell(runtime, end, 'end')

  const visitedBits = reader.bytes(bitsetSize(slots))
  const visited: Record<string, true> = {}
  for (let slot = 0; slot < slots; slot += 1) {
    if (!readBit(visitedBits, slot)) {
      continue
    }
    const point = slotToPoint(slot, topology)
    assertActiveCell(runtime, point, 'visited')
    visited[key(point.x, point.y)] = true
  }

  const pathLength = reader.varint()
  const path: MazePoint[] = []
  if (pathLength > slots) {
    throw new MazeFileError('The saved path is longer than the topology allows.')
  }
  if (pathLength > 0) {
    let current = slotToPoint(reader.varint(), topology)
    assertActiveCell(runtime, current, 'path')
    path.push(current)
    const directions = unpackTwoBitValues(reader.bytes(bitsetSize((pathLength - 1) * 2)), pathLength - 1)
    for (const direction of directions) {
      const next = movePoint(current, direction)
      assertOpenStep(runtime, current, next)
      path.push(next)
      current = next
    }
  }

  const headCount = reader.varint()
  if (headCount > 1) {
    throw new MazeFileError('Square .maze v1 files support at most one solve head.')
  }
  const head = headCount === 1 ? slotToPoint(reader.varint(), topology) : null
  if (head) {
    assertActiveCell(runtime, head, 'head')
  }

  reader.done()

  if (
    status === 'solved'
    && algorithm !== 'flood'
    && (path.length === 0 || !samePoint(path[0], start) || !samePoint(path.at(-1)!, end))
  ) {
    throw new MazeFileError('A solved state must contain a path from start to end.')
  }
  if (status === 'unsolved' && path.length > 0) {
    throw new MazeFileError('An unsolved state cannot contain a solution path.')
  }
  if (status === 'generated' && (Object.keys(visited).length > 0 || path.length > 0)) {
    throw new MazeFileError('A generated state cannot contain solve progress.')
  }

  return { algorithm, end, head, path, start, status, visited }
}

function encodeCellColors(shape: AppliedShape | null, rows: number, cols: number): Uint8Array | null {
  if (!shape) {
    return null
  }

  const colors: Array<[number, number, number] | null> = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const value = shape.cellColors[row]?.[col]
      const match = value?.match(/^#([0-9a-f]{6})$/i)
      colors.push(match
        ? [
            Number.parseInt(match[1].slice(0, 2), 16),
            Number.parseInt(match[1].slice(2, 4), 16),
            Number.parseInt(match[1].slice(4, 6), 16),
          ]
        : null)
    }
  }

  const writer = new ByteWriter()
  writer.bytes(encodeBitset(colors.length, index => colors[index] !== null))
  for (const color of colors) {
    if (color) {
      writer.bytes(new Uint8Array(color))
    }
  }
  return writer.finish()
}

function decodeCellColors(bytes: Uint8Array, topology: DecodedTopology): (string | null)[][] {
  const slots = topology.rows * topology.cols
  const reader = new ByteReader(bytes)
  const present = reader.bytes(bitsetSize(slots))
  const colors: (string | null)[][] = []
  for (let row = 0; row < topology.rows; row += 1) {
    const line: (string | null)[] = []
    for (let col = 0; col < topology.cols; col += 1) {
      const slot = row * topology.cols + col
      if (!readBit(present, slot)) {
        line.push(null)
        continue
      }
      const rgb = reader.bytes(3)
      line.push(`#${[...rgb].map(value => value.toString(16).padStart(2, '0')).join('')}`)
    }
    colors.push(line)
  }
  reader.done()
  return colors
}

function getFileSolveStatus(
  algorithm: MazeSolvingAlgorithm,
  status: SolveState['status'],
  visitedCount: number,
  pathLength: number,
): MazeFileSolveStatus {
  if (status === 'solved') {
    if (algorithm !== 'flood' && pathLength === 0) {
      throw new MazeFileError('A solved maze must contain a solution path.')
    }
    return 'solved'
  }
  if (status === 'unsolved') {
    if (pathLength > 0) {
      throw new MazeFileError('An unsolved maze cannot contain a solution path.')
    }
    return 'unsolved'
  }
  if (visitedCount > 0 || pathLength > 0) {
    throw new MazeFileError('A partially solved maze cannot be saved.')
  }
  return 'generated'
}

function statusToByte(status: MazeFileSolveStatus): number {
  return ['generated', 'solved', 'unsolved'].indexOf(status)
}

function byteToStatus(value: number): MazeFileSolveStatus {
  const status = ['generated', 'solved', 'unsolved'][value]
  if (!status) {
    throw new MazeFileError(`Unknown solve state ${value}.`)
  }
  return status as MazeFileSolveStatus
}

function directionBetween(from: MazePoint, to: MazePoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === -1)
    return 0
  if (dx === 1 && dy === 0)
    return 1
  if (dx === 0 && dy === 1)
    return 2
  if (dx === -1 && dy === 0)
    return 3
  throw new MazeFileError('Path and parent points must be adjacent.')
}

function movePoint(point: MazePoint, direction: number): MazePoint {
  if (direction === 0)
    return { x: point.x, y: point.y - 1 }
  if (direction === 1)
    return { x: point.x + 1, y: point.y }
  if (direction === 2)
    return { x: point.x, y: point.y + 1 }
  return { x: point.x - 1, y: point.y }
}

function assertOpenStep(runtime: Maze, from: MazePoint, to: MazePoint): void {
  const fromCell = runtime.grid.getCell(`${from.y}:${from.x}`)
  const toCell = runtime.grid.getCell(`${to.y}:${to.x}`)
  const open = fromCell?.getEdges().some(edge => edge.opened && edge.getOther(fromCell)?.id === toCell?.id)
  if (!open) {
    throw new MazeFileError('The saved path or parent trail crosses a closed wall.')
  }
}

function assertActiveCell(runtime: Maze, point: MazePoint, label: string): void {
  if (!runtime.grid.getCell(`${point.y}:${point.x}`)) {
    throw new MazeFileError(`The saved ${label} references an excluded cell.`)
  }
}

function pointToSlot(point: MazePoint, rows: number, cols: number): number {
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y)
    || point.x < 0 || point.y < 0 || point.x >= cols || point.y >= rows) {
    throw new MazeFileError(`Point (${point.x}, ${point.y}) is outside the topology.`)
  }
  return point.y * cols + point.x
}

function slotToPoint(slot: number, topology: DecodedTopology): MazePoint {
  if (slot < 0 || slot >= topology.rows * topology.cols) {
    throw new MazeFileError(`Cell ID ${slot} is outside the topology.`)
  }
  return { x: slot % topology.cols, y: Math.floor(slot / topology.cols) }
}

function slotFromCell(cell: SquareCell, cols: number): number {
  return cell.row * cols + cell.col
}

function decodeMask(bytes: Uint8Array, rows: number, cols: number): boolean[][] {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => readBit(bytes, row * cols + col)))
}

function encodeBitset(bitCount: number, predicate: (index: number) => boolean): Uint8Array {
  const bytes = new Uint8Array(bitsetSize(bitCount))
  for (let index = 0; index < bitCount; index += 1) {
    if (predicate(index)) {
      bytes[index >> 3] |= 1 << (index & 7)
    }
  }
  return bytes
}

function readBit(bytes: Uint8Array, index: number): boolean {
  return (bytes[index >> 3] & (1 << (index & 7))) !== 0
}

function bitsetSize(bitCount: number): number {
  return Math.ceil(bitCount / 8)
}

function packTwoBitValues(values: number[]): Uint8Array {
  const bytes = new Uint8Array(bitsetSize(values.length * 2))
  values.forEach((value, index) => {
    bytes[index >> 2] |= (value & 3) << ((index & 3) * 2)
  })
  return bytes
}

function unpackTwoBitValues(bytes: Uint8Array, count: number): number[] {
  return Array.from({ length: count }, (_, index) =>
    (bytes[index >> 2] >> ((index & 3) * 2)) & 3)
}

function encodeChunk(type: number, data: Uint8Array): Uint8Array {
  const writer = new ByteWriter()
  writer.u8(type)
  writer.varint(data.length)
  writer.bytes(data)
  return writer.finish()
}

function decodeChunks(payload: Uint8Array): Map<number, Uint8Array> {
  const reader = new ByteReader(payload)
  const chunks = new Map<number, Uint8Array>()
  while (reader.remaining > 0) {
    const type = reader.u8()
    const length = reader.varint()
    if (chunks.has(type)) {
      throw new MazeFileError(`Duplicate .maze chunk ${type}.`)
    }
    chunks.set(type, reader.bytes(length))
  }
  return chunks
}

function requireChunk(chunks: Map<number, Uint8Array>, type: number): Uint8Array {
  const chunk = chunks.get(type)
  if (!chunk) {
    throw new MazeFileError(`Required .maze chunk ${type} is missing.`)
  }
  return chunk
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value))
}

function decodeMeta(bytes: Uint8Array): MazeFileMeta {
  const value = decodeJson(bytes) as Partial<MazeFileMeta>
  if (!isMazeGenerationAlgorithm(value.generationAlgorithm)
    || typeof value.hasCustomStartAndEndPoints !== 'boolean') {
    throw new MazeFileError('The META chunk is invalid.')
  }
  return value as MazeFileMeta
}

function decodeAppearance(bytes: Uint8Array): MazeFileAppearance {
  const value = decodeJson(bytes) as Partial<MazeFileAppearance>
  if (!isStyleTheme(value.styleTheme)
    || !isStyleVisibility(value.visibleElements)
    || (value.floorTheme !== undefined && !isFloodTheme(value.floorTheme))
    || typeof value.showShapeColors !== 'boolean'
    || !isNumberInRange(value.wallHeightPx, 0, 60)
    || !isNumberInRange(value.wallThickness, 1, 8)) {
    throw new MazeFileError('The STYLE chunk is invalid.')
  }
  return {
    ...value,
    floorTheme: value.floorTheme ?? DEFAULT_FLOOD_THEME,
    styleTheme: normalizeStyleTheme(value.styleTheme),
    visibleElements: normalizeStyleVisibility(value.visibleElements),
  } as MazeFileAppearance
}

function encodeAppearance(value: MazeFileAppearance): object {
  const theme = value.styleTheme as unknown as Record<string, string>
  const visibility = value.visibleElements as unknown as Record<string, boolean>
  const cell = theme.cell ?? theme.road ?? DEFAULT_STYLE_THEME.cell
  const unlinkedCell = theme.unlinkedCell ?? theme.unlinked ?? DEFAULT_STYLE_THEME.unlinkedCell
  const cellVisible = visibility.cell ?? visibility.road ?? DEFAULT_STYLE_VISIBILITY.cell
  const unlinkedCellVisible = visibility.unlinkedCell ?? visibility.unlinked ?? DEFAULT_STYLE_VISIBILITY.unlinkedCell
  return {
    ...value,
    styleTheme: {
      ...value.styleTheme,
      road: cell,
      unlinked: unlinkedCell,
    },
    visibleElements: {
      ...value.visibleElements,
      road: cellVisible,
      unlinked: unlinkedCellVisible,
    },
  }
}

function decodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  }
  catch {
    throw new MazeFileError('A .maze JSON chunk is invalid.')
  }
}

function isStyleTheme(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return ['frontier', 'grid', 'end', 'head', 'path', 'start', 'visit', 'wall']
    .every(name => typeof record[name] === 'string')
    && (typeof record.cell === 'string' || typeof record.road === 'string')
    && (record.subPath === undefined || typeof record.subPath === 'string')
    && (record.unlinkedCell === undefined || typeof record.unlinkedCell === 'string')
    && (record.unlinked === undefined || typeof record.unlinked === 'string')
}

function normalizeStyleTheme(value: unknown): StyleTheme {
  const record = value as Record<string, string>
  return {
    cell: record.cell ?? record.road ?? DEFAULT_STYLE_THEME.cell,
    end: record.end,
    frontier: record.frontier,
    grid: record.grid,
    head: record.head,
    path: record.path,
    start: record.start,
    subPath: record.subPath ?? record.road ?? DEFAULT_STYLE_THEME.subPath,
    unlinkedCell: record.unlinkedCell ?? record.unlinked ?? DEFAULT_STYLE_THEME.unlinkedCell,
    visit: record.visit,
    wall: record.wall,
  }
}

function isStyleVisibility(value: unknown): boolean {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return ['frontier', 'grid', 'end', 'head', 'path', 'start', 'visit', 'wall']
    .every(name => typeof record[name] === 'boolean')
    && (typeof record.cell === 'boolean' || typeof record.road === 'boolean')
    && (record.subPath === undefined || typeof record.subPath === 'boolean')
    && (record.unlinkedCell === undefined || typeof record.unlinkedCell === 'boolean')
    && (record.unlinked === undefined || typeof record.unlinked === 'boolean')
}

function normalizeStyleVisibility(value: unknown): StyleVisibility {
  const record = value as Record<string, boolean>
  return {
    cell: record.cell ?? record.road ?? DEFAULT_STYLE_VISIBILITY.cell,
    end: record.end,
    frontier: record.frontier,
    grid: record.grid,
    head: record.head,
    path: record.path,
    start: record.start,
    subPath: record.subPath ?? record.road ?? DEFAULT_STYLE_VISIBILITY.subPath,
    unlinkedCell: record.unlinkedCell ?? record.unlinked ?? DEFAULT_STYLE_VISIBILITY.unlinkedCell,
    visit: record.visit,
    wall: record.wall,
  }
}

function isNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function assertSaveOptions(options: MazeFileSaveOptions): void {
  if (options.runtime.grid.rows !== options.maze.rows || options.runtime.grid.cols !== options.maze.cols) {
    throw new MazeFileError('The maze view and runtime dimensions do not match.')
  }
  assertActiveCell(options.runtime, options.maze.start, 'start')
  assertActiveCell(options.runtime, options.maze.end, 'end')
  for (const pointKey of Object.keys(options.solve.visited)) {
    assertActiveCell(options.runtime, parsePointKey(pointKey), 'visited')
  }
  if (options.solve.head) {
    assertActiveCell(options.runtime, options.solve.head, 'head')
  }
}

function enumIndex<Value>(values: readonly Value[], value: Value, label: string): number {
  const index = values.indexOf(value)
  if (index < 0) {
    throw new MazeFileError(`Unknown ${label}.`)
  }
  return index
}

function enumValue<Value>(values: readonly Value[], index: number, label: string): Value {
  const value = values[index]
  if (value === undefined) {
    throw new MazeFileError(`Unknown ${label} ID ${index}.`)
  }
  return value
}

function samePoint(a: MazePoint, b: MazePoint): boolean {
  return a.x === b.x && a.y === b.y
}

function throwUnsupportedCodec(codec: number): never {
  throw new MazeFileError(`Unsupported .maze compression codec ${codec}.`)
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    throw new MazeFileError('This browser does not support .maze compression.')
  }
  return transformBytes(bytes, new CompressionStream('gzip'))
}

async function gunzip(bytes: Uint8Array, expectedSize: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new MazeFileError('This browser does not support .maze decompression.')
  }
  try {
    return await transformBytes(bytes, new DecompressionStream('gzip'), expectedSize)
  }
  catch {
    throw new MazeFileError('The compressed .maze payload is invalid.')
  }
}

async function transformBytes(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
  outputLimit = Number.POSITIVE_INFINITY,
): Promise<Uint8Array> {
  const input = new Blob([bytes.slice().buffer]).stream()
  const reader = input.pipeThrough(stream).getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const result = await reader.read()
    if (result.done) {
      break
    }
    total += result.value.length
    if (total > outputLimit) {
      await reader.cancel()
      throw new MazeFileError('The decompressed .maze payload exceeds its declared size.')
    }
    chunks.push(result.value)
  }
  return concatBytes(chunks)
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

class ByteWriter {
  private readonly output: number[] = []

  u8(value: number): void {
    this.output.push(value & 0xFF)
  }

  varint(value: number): void {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xFFFFFFFF) {
      throw new MazeFileError(`Invalid varint value ${value}.`)
    }
    let current = value
    while (current >= 0x80) {
      this.u8((current & 0x7F) | 0x80)
      current = Math.floor(current / 0x80)
    }
    this.u8(current)
  }

  bytes(value: Uint8Array): void {
    for (const byte of value) {
      this.output.push(byte)
    }
  }

  finish(): Uint8Array {
    return new Uint8Array(this.output)
  }
}

class ByteReader {
  private offset = 0

  constructor(private readonly input: Uint8Array) {}

  get remaining(): number {
    return this.input.length - this.offset
  }

  u8(): number {
    if (this.remaining < 1) {
      throw new MazeFileError('The .maze payload ended unexpectedly.')
    }
    return this.input[this.offset++]
  }

  varint(): number {
    let value = 0
    let multiplier = 1
    for (let byteIndex = 0; byteIndex < 5; byteIndex += 1) {
      const byte = this.u8()
      value += (byte & 0x7F) * multiplier
      if ((byte & 0x80) === 0) {
        if (!Number.isSafeInteger(value) || value > 0xFFFFFFFF) {
          break
        }
        return value
      }
      multiplier *= 0x80
    }
    throw new MazeFileError('The .maze payload contains an invalid varint.')
  }

  bytes(length: number): Uint8Array {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.remaining) {
      throw new MazeFileError('The .maze payload contains an invalid chunk length.')
    }
    const value = this.input.subarray(this.offset, this.offset + length)
    this.offset += length
    return value
  }

  done(): void {
    if (this.remaining !== 0) {
      throw new MazeFileError('A .maze chunk contains unexpected trailing data.')
    }
  }
}
