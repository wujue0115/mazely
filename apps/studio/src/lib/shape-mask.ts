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

/**
 * Downsamples the pixel keep mask into a `rows x cols` cell mask. A cell is
 * kept when at least half of the pixels it covers are kept.
 */
export function buildCellMask(pixelMask: PixelMask, cols: number, rows: number): CellMask {
  const { data, height, width } = pixelMask
  const mask: CellMask = []

  for (let row = 0; row < rows; row += 1) {
    const startY = Math.floor((row * height) / rows)
    const endY = Math.max(startY + 1, Math.floor(((row + 1) * height) / rows))
    const line: boolean[] = []
    for (let col = 0; col < cols; col += 1) {
      const startX = Math.floor((col * width) / cols)
      const endX = Math.max(startX + 1, Math.floor(((col + 1) * width) / cols))

      let kept = 0
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          kept += data[y * width + x]
        }
      }
      const total = (endY - startY) * (endX - startX)
      line.push(kept * 2 >= total)
    }
    mask.push(line)
  }

  return mask
}

export interface MaskRegions {
  /** Number of 4-connected regions of kept cells. */
  count: number
  /** Cells in the largest region. */
  largestSize: number
  /** Total kept cells. */
  cellCount: number
  /** Region id per cell (row-major), 0 for removed cells, 1-based otherwise. */
  labels: Int32Array
}

/** Labels 4-connected regions of kept cells. */
export function findMaskRegions(mask: CellMask): MaskRegions {
  const rows = mask.length
  const cols = mask[0]?.length ?? 0
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
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || !mask[ny][nx]) {
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
 * Returns a copy of the mask keeping only its largest 4-connected region
 * (ties broken by first region found in scan order).
 */
export function keepLargestMaskRegion(mask: CellMask): CellMask {
  const rows = mask.length
  const cols = mask[0]?.length ?? 0
  const regions = findMaskRegions(mask)
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
    for (let col = 0; col < cols; col += 1) {
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
export function prunePixelMaskToCells(pixelMask: PixelMask, cellMask: CellMask): void {
  const { data, height, width } = pixelMask
  const rows = cellMask.length
  const cols = cellMask[0]?.length ?? 0

  for (let y = 0; y < height; y += 1) {
    const row = Math.min(rows - 1, Math.floor((y * rows) / height))
    for (let x = 0; x < width; x += 1) {
      const col = Math.min(cols - 1, Math.floor((x * cols) / width))
      if (!cellMask[row][col]) {
        data[y * width + x] = 0
      }
    }
  }
}

/**
 * Picks far-apart start and end cells from the mask using a double
 * BFS sweep (approximate graph diameter). Assumes a single region; with
 * multiple regions it stays within the region of the first kept cell.
 */
export function findFarthestMaskCells(mask: CellMask): { start: MazePoint, end: MazePoint } | null {
  const first = findFirstMaskCell(mask)
  if (!first) {
    return null
  }

  const start = bfsFarthest(mask, first)
  const end = bfsFarthest(mask, start)
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

function bfsFarthest(mask: CellMask, from: MazePoint): MazePoint {
  const rows = mask.length
  const cols = mask[0]?.length ?? 0
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
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || !mask[ny][nx]) {
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
 * kept, 4-connected cells whose average image color stays within `tolerance`
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
): number {
  const rows = cellMask.length
  const cols = cellMask[0]?.length ?? 0
  if (clickedCol < 0 || clickedCol >= cols || clickedRow < 0 || clickedRow >= rows) {
    return 0
  }
  if (!cellMask[clickedRow][clickedCol]) {
    return 0
  }

  const averages = buildCellAverageColors(image, pixelMask, cols, rows)
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
    clearCellPixels(pixelMask, col, row, cols, rows)

    for (const [nc, nr] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]] as const) {
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || !cellMask[nr][nc]) {
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
): Float64Array {
  const { data } = image
  const { height, width } = pixelMask
  const averages = new Float64Array(rows * cols * 3)

  for (let row = 0; row < rows; row += 1) {
    const startY = Math.floor((row * height) / rows)
    const endY = Math.max(startY + 1, Math.floor(((row + 1) * height) / rows))
    for (let col = 0; col < cols; col += 1) {
      const startX = Math.floor((col * width) / cols)
      const endX = Math.max(startX + 1, Math.floor(((col + 1) * width) / cols))

      let red = 0
      let green = 0
      let blue = 0
      let count = 0
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const offset = (y * width + x) * 4
          red += data[offset]
          green += data[offset + 1]
          blue += data[offset + 2]
          count += 1
        }
      }
      const cell = (row * cols + col) * 3
      averages[cell] = red / count
      averages[cell + 1] = green / count
      averages[cell + 2] = blue / count
    }
  }

  return averages
}

/** Clears every pixel covered by a cell, using buildCellMask's boundaries. */
function clearCellPixels(
  pixelMask: PixelMask,
  col: number,
  row: number,
  cols: number,
  rows: number,
): void {
  const { data, height, width } = pixelMask
  const startX = Math.floor((col * width) / cols)
  const endX = Math.max(startX + 1, Math.floor(((col + 1) * width) / cols))
  const startY = Math.floor((row * height) / rows)
  const endY = Math.max(startY + 1, Math.floor(((row + 1) * height) / rows))

  for (let y = startY; y < endY; y += 1) {
    for (let x = startX; x < endX; x += 1) {
      data[y * width + x] = 0
    }
  }
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
): CellColors {
  const { data } = image
  const { height, width } = pixelMask
  const colors: CellColors = []

  for (let row = 0; row < rows; row += 1) {
    const startY = Math.floor((row * height) / rows)
    const endY = Math.max(startY + 1, Math.floor(((row + 1) * height) / rows))
    const line: (string | null)[] = []
    for (let col = 0; col < cols; col += 1) {
      if (!cellMask[row]?.[col]) {
        line.push(null)
        continue
      }
      const startX = Math.floor((col * width) / cols)
      const endX = Math.max(startX + 1, Math.floor(((col + 1) * width) / cols))

      let red = 0
      let green = 0
      let blue = 0
      let keptCount = 0
      let totalRed = 0
      let totalGreen = 0
      let totalBlue = 0
      let totalCount = 0
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const offset = (y * width + x) * 4
          totalRed += data[offset]
          totalGreen += data[offset + 1]
          totalBlue += data[offset + 2]
          totalCount += 1
          if (pixelMask.data[y * width + x] === 1) {
            red += data[offset]
            green += data[offset + 1]
            blue += data[offset + 2]
            keptCount += 1
          }
        }
      }

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
