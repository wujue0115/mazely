import type { TriangleGridLayout } from 'mazely'
import type { MazePoint } from './maze-types'

/**
 * Pixel-level keep mask over an image: 1 keeps the pixel inside the shape,
 * 0 removes it. Sized `width * height`, row-major.
 */
export interface PixelMask {
  data: Uint8Array
  width: number
  height: number
}

/** Cell mask indexed as `mask[row][col]`; `true` keeps the cell. */
export type CellMask = boolean[][]

export type ShapeGridTopology
  = | { type: 'square' }
    | { layout: TriangleGridLayout, type: 'triangle' }

export interface ShapeGridDimensions {
  cols: number
  rows: number
}

interface PixelPoint {
  x: number
  y: number
}

const SQUARE_TOPOLOGY: ShapeGridTopology = { type: 'square' }
const TRIANGLE_HEIGHT = Math.sqrt(3) / 2

const ALPHA_OPAQUE_THRESHOLD = 128

/**
 * Derives the initial keep mask from an image. Images with real transparency
 * keep their opaque pixels; opaque images get background removal via flood
 * fill from the borders, treating pixels close to the border color (within
 * `colorThreshold`, 0-255 per-channel distance) as background.
 */
export function buildAutoPixelMask(image: ImageData, colorThreshold: number): PixelMask {
  if (hasMeaningfulAlpha(image)) {
    return buildAlphaPixelMask(image)
  }
  return buildFloodFillPixelMask(image, colorThreshold)
}

function hasMeaningfulAlpha(image: ImageData): boolean {
  const { data } = image
  for (let index = 3; index < data.length; index += 4) {
    if (data[index] < 250) {
      return true
    }
  }
  return false
}

function buildAlphaPixelMask(image: ImageData): PixelMask {
  const { data, height, width } = image
  const mask = new Uint8Array(width * height)
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    mask[pixel] = data[pixel * 4 + 3] >= ALPHA_OPAQUE_THRESHOLD ? 1 : 0
  }
  return { data: mask, height, width }
}

/**
 * Flood fills from every border pixel, removing pixels whose color stays
 * within `threshold` of the border seed that reached them. Comparing against
 * the seed (not the neighboring pixel) prevents the fill from creeping
 * through anti-aliased gradients into the foreground. Everything the fill
 * never reaches is kept.
 */
function buildFloodFillPixelMask(image: ImageData, threshold: number): PixelMask {
  const { data, height, width } = image
  const mask = new Uint8Array(width * height).fill(1)
  const queue: number[] = []
  const seeds: number[] = []
  const thresholdSquared = threshold * threshold * 3

  const tryEnqueue = (pixel: number, seedPixel: number): void => {
    if (mask[pixel] === 0) {
      return
    }
    if (colorDistanceSquared(data, pixel, seedPixel) > thresholdSquared) {
      return
    }
    mask[pixel] = 0
    queue.push(pixel)
    seeds.push(seedPixel)
  }

  for (let x = 0; x < width; x += 1) {
    tryEnqueue(x, x)
    tryEnqueue((height - 1) * width + x, (height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    tryEnqueue(y * width, y * width)
    tryEnqueue(y * width + width - 1, y * width + width - 1)
  }

  let head = 0
  while (head < queue.length) {
    const pixel = queue[head]
    const seed = seeds[head]
    head += 1
    const x = pixel % width
    const y = (pixel - x) / width
    if (x > 0) {
      tryEnqueue(pixel - 1, seed)
    }
    if (x < width - 1) {
      tryEnqueue(pixel + 1, seed)
    }
    if (y > 0) {
      tryEnqueue(pixel - width, seed)
    }
    if (y < height - 1) {
      tryEnqueue(pixel + width, seed)
    }
  }

  return { data: mask, height, width }
}

function colorDistanceSquared(data: Uint8ClampedArray, pixelA: number, pixelB: number): number {
  const offsetA = pixelA * 4
  const offsetB = pixelB * 4
  const dr = data[offsetA] - data[offsetB]
  const dg = data[offsetA + 1] - data[offsetB + 1]
  const db = data[offsetA + 2] - data[offsetB + 2]
  return dr * dr + dg * dg + db * db
}

/** Resolves grid dimensions from an image and the editor's primary size. */
export function getShapeGridDimensions(
  imageWidth: number,
  imageHeight: number,
  size: number,
  topology: ShapeGridTopology = SQUARE_TOPOLOGY,
): ShapeGridDimensions {
  if (topology.type === 'triangle' && topology.layout === 'triangle') {
    return { cols: size * 2 - 1, rows: size }
  }
  if (topology.type === 'triangle') {
    const worldWidth = (size + 1) / 2
    const rows = Math.max(1, Math.round((worldWidth * imageHeight) / (imageWidth * TRIANGLE_HEIGHT)))
    return { cols: size, rows }
  }
  return {
    cols: size,
    rows: Math.max(1, Math.round((size * imageHeight) / imageWidth)),
  }
}

/** Pixel-space polygon occupied by one cell. */
export function getShapeCellPolygon(
  pixelMask: Pick<PixelMask, 'height' | 'width'>,
  col: number,
  row: number,
  cols: number,
  rows: number,
  topology: ShapeGridTopology = SQUARE_TOPOLOGY,
): PixelPoint[] | null {
  if (!isShapeCellCoordinate(col, row, cols, rows, topology)) {
    return null
  }
  if (topology.type === 'square') {
    const left = (col * pixelMask.width) / cols
    const right = ((col + 1) * pixelMask.width) / cols
    const top = (row * pixelMask.height) / rows
    const bottom = ((row + 1) * pixelMask.height) / rows
    return [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ]
  }

  const worldWidth = (cols + 1) / 2
  const worldHeight = rows * TRIANGLE_HEIGHT
  const offsetX = topology.layout === 'triangle' ? (rows - row - 1) / 2 : 0
  const left = offsetX + col / 2
  const top = row * TRIANGLE_HEIGHT
  const orientationUp = (topology.layout === 'triangle' ? col : row + col) % 2 === 0
  const worldPolygon = orientationUp
    ? [
        { x: left + 0.5, y: top },
        { x: left + 1, y: top + TRIANGLE_HEIGHT },
        { x: left, y: top + TRIANGLE_HEIGHT },
      ]
    : [
        { x: left, y: top },
        { x: left + 1, y: top },
        { x: left + 0.5, y: top + TRIANGLE_HEIGHT },
      ]
  return worldPolygon.map(point => ({
    x: (point.x / worldWidth) * pixelMask.width,
    y: (point.y / worldHeight) * pixelMask.height,
  }))
}

/** Returns the cell containing a bitmap point, respecting triangle edges. */
export function findShapeCellAtPixel(
  pixelMask: Pick<PixelMask, 'height' | 'width'>,
  bitmapX: number,
  bitmapY: number,
  cols: number,
  rows: number,
  topology: ShapeGridTopology = SQUARE_TOPOLOGY,
): MazePoint | null {
  if (topology.type === 'square') {
    const col = Math.floor((bitmapX / pixelMask.width) * cols)
    const row = Math.floor((bitmapY / pixelMask.height) * rows)
    return isShapeCellCoordinate(col, row, cols, rows, topology) ? { x: col, y: row } : null
  }

  const approximateRow = Math.floor((bitmapY / pixelMask.height) * rows)
  const worldWidth = (cols + 1) / 2
  const worldX = (bitmapX / pixelMask.width) * worldWidth
  for (let row = approximateRow - 1; row <= approximateRow + 1; row += 1) {
    const offsetX = topology.layout === 'triangle' ? (rows - row - 1) / 2 : 0
    const approximateCol = Math.floor((worldX - offsetX) * 2)
    for (let col = approximateCol - 2; col <= approximateCol + 2; col += 1) {
      const polygon = getShapeCellPolygon(pixelMask, col, row, cols, rows, topology)
      if (polygon && isPointInPolygon(bitmapX, bitmapY, polygon)) {
        return { x: col, y: row }
      }
    }
  }
  return null
}

/**
 * Downsamples the pixel keep mask into a cell mask. Triangle cells sample
 * only pixels whose centers lie inside their polygon.
 */
export function buildCellMask(
  pixelMask: PixelMask,
  cols: number,
  rows: number,
  topology: ShapeGridTopology = SQUARE_TOPOLOGY,
): CellMask {
  const mask: CellMask = []

  for (let row = 0; row < rows; row += 1) {
    const line: boolean[] = []
    const rowCols = getShapeRowCellCount(row, cols, topology)
    for (let col = 0; col < rowCols; col += 1) {
      let kept = 0
      let total = 0
      visitShapeCellPixels(pixelMask, col, row, cols, rows, topology, (pixel) => {
        kept += pixelMask.data[pixel]
        total += 1
      })
      line.push(kept * 2 >= total)
    }
    mask.push(line)
  }

  return mask
}

export interface MaskRegions {
  /** Number of topology-connected regions of kept cells. */
  count: number
  /** Cells in the largest region. */
  largestSize: number
  /** Total kept cells. */
  cellCount: number
  /** Region id per cell (row-major), 0 for removed cells, 1-based otherwise. */
  labels: Int32Array
}

/** Labels regions using the selected grid's real cell adjacency. */
export function findMaskRegions(
  mask: CellMask,
  topology: ShapeGridTopology = SQUARE_TOPOLOGY,
): MaskRegions {
  const rows = mask.length
  const cols = getMaskCols(mask)
  const labels = new Int32Array(rows * cols)
  const sizes: number[] = []
  let cellCount = 0

  const queue: number[] = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!mask[row][col]) {
        continue
      }
      cellCount += 1
      const index = row * cols + col
      if (labels[index] !== 0) {
        continue
      }

      const regionId = sizes.length + 1
      let size = 0
      labels[index] = regionId
      queue.length = 0
      queue.push(index)
      let head = 0
      while (head < queue.length) {
        const current = queue[head]
        head += 1
        size += 1
        const x = current % cols
        const y = (current - x) / cols
        for (const neighborPoint of getShapeCellNeighbors(x, y, cols, rows, topology)) {
          const { x: nx, y: ny } = neighborPoint
          if (!mask[ny]?.[nx]) {
            continue
          }
          const neighbor = ny * cols + nx
          if (labels[neighbor] === 0) {
            labels[neighbor] = regionId
            queue.push(neighbor)
          }
        }
      }
      sizes.push(size)
    }
  }

  return {
    cellCount,
    count: sizes.length,
    labels,
    largestSize: sizes.length > 0 ? Math.max(...sizes) : 0,
  }
}

/**
 * Returns a copy of the mask keeping only its largest topology-connected region
 * (ties broken by first region found in scan order).
 */
export function keepLargestMaskRegion(
  mask: CellMask,
  topology: ShapeGridTopology = SQUARE_TOPOLOGY,
): CellMask {
  const rows = mask.length
  const cols = getMaskCols(mask)
  const regions = findMaskRegions(mask, topology)
  if (regions.count <= 1) {
    return mask.map(line => [...line])
  }

  const regionSizes = new Map<number, number>()
  for (const label of regions.labels) {
    if (label !== 0) {
      regionSizes.set(label, (regionSizes.get(label) ?? 0) + 1)
    }
  }
  let largestLabel = 0
  let largestSize = -1
  for (const [label, size] of regionSizes) {
    if (size > largestSize) {
      largestSize = size
      largestLabel = label
    }
  }

  const result: CellMask = []
  for (let row = 0; row < rows; row += 1) {
    const line: boolean[] = []
    for (let col = 0; col < mask[row].length; col += 1) {
      line.push(regions.labels[row * cols + col] === largestLabel)
    }
    result.push(line)
  }
  return result
}

/**
 * Clears kept pixels that fall inside removed cells, so the pixel mask stays
 * consistent with a pruned cell mask.
 */
export function prunePixelMaskToCells(
  pixelMask: PixelMask,
  cellMask: CellMask,
  topology: ShapeGridTopology = SQUARE_TOPOLOGY,
): void {
  const rows = cellMask.length
  const cols = getMaskCols(cellMask)

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cellMask[row].length; col += 1) {
      if (!cellMask[row][col]) {
        setShapeCellPixels(pixelMask, col, row, cols, rows, topology, 0)
      }
    }
  }
}

/**
 * Picks far-apart start and end cells from the mask using a double
 * BFS sweep (approximate graph diameter). Assumes a single region; with
 * multiple regions it stays within the region of the first kept cell.
 */
export function findFarthestMaskCells(
  mask: CellMask,
  topology: ShapeGridTopology = SQUARE_TOPOLOGY,
): { start: MazePoint, end: MazePoint } | null {
  const first = findFirstMaskCell(mask)
  if (!first) {
    return null
  }

  const start = bfsFarthest(mask, first, topology)
  const end = bfsFarthest(mask, start, topology)
  return { end, start }
}

function findFirstMaskCell(mask: CellMask): MazePoint | null {
  for (let row = 0; row < mask.length; row += 1) {
    for (let col = 0; col < mask[row].length; col += 1) {
      if (mask[row][col]) {
        return { x: col, y: row }
      }
    }
  }
  return null
}

function bfsFarthest(mask: CellMask, from: MazePoint, topology: ShapeGridTopology): MazePoint {
  const rows = mask.length
  const cols = getMaskCols(mask)
  const visited = new Uint8Array(rows * cols)
  const queue: number[] = [from.y * cols + from.x]
  visited[queue[0]] = 1

  let head = 0
  let last = queue[0]
  while (head < queue.length) {
    const current = queue[head]
    head += 1
    last = current
    const x = current % cols
    const y = (current - x) / cols
    for (const neighborPoint of getShapeCellNeighbors(x, y, cols, rows, topology)) {
      const { x: nx, y: ny } = neighborPoint
      if (!mask[ny]?.[nx]) {
        continue
      }
      const neighbor = ny * cols + nx
      if (!visited[neighbor]) {
        visited[neighbor] = 1
        queue.push(neighbor)
      }
    }
  }

  return { x: last % cols, y: Math.floor(last / cols) }
}

/**
 * Cell-based magic wand: flood fills from the clicked cell across currently
 * kept, topology-connected cells whose average image color stays within `tolerance`
 * (0-255 per-channel) of the clicked cell's average color, clearing their
 * pixels from the mask. Comparing against the fixed seed cell keeps
 * gradients from letting the fill creep into genuinely different colors.
 * Returns the number of removed cells.
 */
export function removeSimilarCells(
  image: ImageData,
  pixelMask: PixelMask,
  cellMask: CellMask,
  clickedCol: number,
  clickedRow: number,
  tolerance: number,
  topology: ShapeGridTopology = SQUARE_TOPOLOGY,
): number {
  const rows = cellMask.length
  const cols = getMaskCols(cellMask)
  if (!isShapeCellCoordinate(clickedCol, clickedRow, cols, rows, topology)) {
    return 0
  }
  if (!cellMask[clickedRow][clickedCol]) {
    return 0
  }

  const averages = buildCellAverageColors(image, pixelMask, cols, rows, topology)
  const seed = clickedRow * cols + clickedCol
  const thresholdSquared = tolerance * tolerance * 3
  const isSimilar = (cell: number): boolean => {
    const dr = averages[cell * 3] - averages[seed * 3]
    const dg = averages[cell * 3 + 1] - averages[seed * 3 + 1]
    const db = averages[cell * 3 + 2] - averages[seed * 3 + 2]
    return dr * dr + dg * dg + db * db <= thresholdSquared
  }

  const removedFlags = new Uint8Array(rows * cols)
  const queue: number[] = [seed]
  removedFlags[seed] = 1
  let removed = 0

  let head = 0
  while (head < queue.length) {
    const cell = queue[head]
    head += 1
    removed += 1
    const col = cell % cols
    const row = (cell - col) / cols
    setShapeCellPixels(pixelMask, col, row, cols, rows, topology, 0)

    for (const neighborPoint of getShapeCellNeighbors(col, row, cols, rows, topology)) {
      const { x: nc, y: nr } = neighborPoint
      if (!cellMask[nr]?.[nc]) {
        continue
      }
      const neighbor = nr * cols + nc
      if (removedFlags[neighbor] || !isSimilar(neighbor)) {
        continue
      }
      removedFlags[neighbor] = 1
      queue.push(neighbor)
    }
  }

  return removed
}

/**
 * Average image color per cell (all covered pixels, mask-independent),
 * packed as [r, g, b] triplets in cell scan order.
 */
function buildCellAverageColors(
  image: ImageData,
  pixelMask: PixelMask,
  cols: number,
  rows: number,
  topology: ShapeGridTopology,
): Float64Array {
  const { data } = image
  const averages = new Float64Array(rows * cols * 3)

  for (let row = 0; row < rows; row += 1) {
    const rowCols = getShapeRowCellCount(row, cols, topology)
    for (let col = 0; col < rowCols; col += 1) {
      let red = 0
      let green = 0
      let blue = 0
      let count = 0
      visitShapeCellPixels(pixelMask, col, row, cols, rows, topology, (pixel) => {
        const offset = pixel * 4
        red += data[offset]
        green += data[offset + 1]
        blue += data[offset + 2]
        count += 1
      })
      const cell = (row * cols + col) * 3
      averages[cell] = red / count
      averages[cell + 1] = green / count
      averages[cell + 2] = blue / count
    }
  }

  return averages
}

/** Hex color per cell (row-major grid), `null` for cells outside the mask. */
export type CellColors = (string | null)[][]

/**
 * Computes the representative color of every kept cell: the average of the
 * kept pixels the cell covers (falling back to all covered pixels when a
 * kept cell happens to contain none, e.g. after majority-vote rounding).
 */
export function buildCellColors(
  image: ImageData,
  pixelMask: PixelMask,
  cellMask: CellMask,
  cols: number,
  rows: number,
  topology: ShapeGridTopology = SQUARE_TOPOLOGY,
): CellColors {
  const { data } = image
  const colors: CellColors = []

  for (let row = 0; row < rows; row += 1) {
    const line: (string | null)[] = []
    const rowCols = getShapeRowCellCount(row, cols, topology)
    for (let col = 0; col < rowCols; col += 1) {
      if (!cellMask[row]?.[col]) {
        line.push(null)
        continue
      }

      let red = 0
      let green = 0
      let blue = 0
      let keptCount = 0
      let totalRed = 0
      let totalGreen = 0
      let totalBlue = 0
      let totalCount = 0
      visitShapeCellPixels(pixelMask, col, row, cols, rows, topology, (pixel) => {
        const offset = pixel * 4
        totalRed += data[offset]
        totalGreen += data[offset + 1]
        totalBlue += data[offset + 2]
        totalCount += 1
        if (pixelMask.data[pixel] === 1) {
          red += data[offset]
          green += data[offset + 1]
          blue += data[offset + 2]
          keptCount += 1
        }
      })

      if (keptCount === 0) {
        red = totalRed
        green = totalGreen
        blue = totalBlue
        keptCount = totalCount
      }
      line.push(rgbToHex(
        Math.round(red / keptCount),
        Math.round(green / keptCount),
        Math.round(blue / keptCount),
      ))
    }
    colors.push(line)
  }

  return colors
}

/** Sets all pixel samples covered by one grid cell. */
export function setShapeCellPixels(
  pixelMask: PixelMask,
  col: number,
  row: number,
  cols: number,
  rows: number,
  topology: ShapeGridTopology,
  value: 0 | 1,
): void {
  visitShapeCellPixels(pixelMask, col, row, cols, rows, topology, (pixel) => {
    pixelMask.data[pixel] = value
  })
}

function visitShapeCellPixels(
  pixelMask: Pick<PixelMask, 'height' | 'width'>,
  col: number,
  row: number,
  cols: number,
  rows: number,
  topology: ShapeGridTopology,
  visit: (pixel: number) => void,
): void {
  const polygon = getShapeCellPolygon(pixelMask, col, row, cols, rows, topology)
  if (!polygon) {
    return
  }
  const minX = Math.max(0, Math.floor(Math.min(...polygon.map(point => point.x))))
  const maxX = Math.min(pixelMask.width - 1, Math.ceil(Math.max(...polygon.map(point => point.x))) - 1)
  const minY = Math.max(0, Math.floor(Math.min(...polygon.map(point => point.y))))
  const maxY = Math.min(pixelMask.height - 1, Math.ceil(Math.max(...polygon.map(point => point.y))) - 1)
  let visited = 0
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (isPointInPolygon(x + 0.5, y + 0.5, polygon, false)) {
        visit(y * pixelMask.width + x)
        visited += 1
      }
    }
  }
  if (visited === 0) {
    const centerX = polygon.reduce((sum, point) => sum + point.x, 0) / polygon.length
    const centerY = polygon.reduce((sum, point) => sum + point.y, 0) / polygon.length
    const x = Math.min(pixelMask.width - 1, Math.max(0, Math.floor(centerX)))
    const y = Math.min(pixelMask.height - 1, Math.max(0, Math.floor(centerY)))
    visit(y * pixelMask.width + x)
  }
}

function getShapeCellNeighbors(
  col: number,
  row: number,
  cols: number,
  rows: number,
  topology: ShapeGridTopology,
): MazePoint[] {
  const candidates: MazePoint[] = [
    { x: col - 1, y: row },
    { x: col + 1, y: row },
  ]
  if (topology.type === 'square') {
    candidates.push({ x: col, y: row - 1 }, { x: col, y: row + 1 })
  }
  else {
    const orientationUp = (topology.layout === 'triangle' ? col : row + col) % 2 === 0
    if (topology.layout === 'triangle') {
      candidates.push(orientationUp
        ? { x: col + 1, y: row + 1 }
        : { x: col - 1, y: row - 1 })
    }
    else {
      candidates.push({ x: col, y: row + (orientationUp ? 1 : -1) })
    }
  }
  return candidates.filter(point => isShapeCellCoordinate(point.x, point.y, cols, rows, topology))
}

function getShapeRowCellCount(row: number, cols: number, topology: ShapeGridTopology): number {
  return topology.type === 'triangle' && topology.layout === 'triangle' ? row * 2 + 1 : cols
}

function isShapeCellCoordinate(
  col: number,
  row: number,
  cols: number,
  rows: number,
  topology: ShapeGridTopology,
): boolean {
  return row >= 0
    && row < rows
    && col >= 0
    && col < getShapeRowCellCount(row, cols, topology)
}

function getMaskCols(mask: CellMask): number {
  return mask.reduce((max, line) => Math.max(max, line.length), 0)
}

function isPointInPolygon(
  x: number,
  y: number,
  polygon: PixelPoint[],
  includeBoundary = true,
): boolean {
  let inside = false
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const a = polygon[current]
    const b = polygon[previous]
    if (isPointOnSegment(x, y, a, b)) {
      return includeBoundary
    }
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside
    }
  }
  return inside
}

function isPointOnSegment(x: number, y: number, a: PixelPoint, b: PixelPoint): boolean {
  const cross = (x - a.x) * (b.y - a.y) - (y - a.y) * (b.x - a.x)
  if (Math.abs(cross) > 1e-7) {
    return false
  }
  return x >= Math.min(a.x, b.x) - 1e-7
    && x <= Math.max(a.x, b.x) + 1e-7
    && y >= Math.min(a.y, b.y) - 1e-7
    && y <= Math.max(a.y, b.y) + 1e-7
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${((1 << 24) | (red << 16) | (green << 8) | blue).toString(16).slice(1)}`
}

/** Uniformly picks a random kept cell. */
export function getRandomMaskPoint(mask: CellMask): MazePoint | null {
  const kept: MazePoint[] = []
  for (let row = 0; row < mask.length; row += 1) {
    for (let col = 0; col < mask[row].length; col += 1) {
      if (mask[row][col]) {
        kept.push({ x: col, y: row })
      }
    }
  }
  if (kept.length === 0) {
    return null
  }
  return kept[Math.floor(Math.random() * kept.length)]
}

/** Counts kept cells. */
export function countMaskCells(mask: CellMask): number {
  let count = 0
  for (const line of mask) {
    for (const kept of line) {
      if (kept) {
        count += 1
      }
    }
  }
  return count
}
