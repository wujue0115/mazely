import type { MazePoint } from '../maze-types'
import type { CellColors, CellMask, PixelMask } from '../shape-mask'
import {
  buildAutoPixelMask,
  buildCellColors,
  buildCellMask,
  findFarthestMaskCells,
  findMaskRegions,
  keepLargestMaskRegion,
  prunePixelMaskToCells,
  removeSimilarCells,
} from '../shape-mask'
import {
  clamp,
  getContext2d,
  getWheelZoomFactor,
  GRID_DIMENSION_MAX,
  query,
} from '../utils'

/** Result handed to the app when the user applies an edited shape. */
export interface AppliedShape {
  cellMask: CellMask
  /** Representative image color per kept cell, `null` outside the shape. */
  cellColors: CellColors
  cols: number
  rows: number
  start: MazePoint
  end: MazePoint
}

export interface ShapeEditorOptions {
  onApply: (shape: AppliedShape) => void
  getDefaultCols: () => number
  showToast: (message: string) => void
}

export interface ShapeEditorApi {
  /** Loads an image file and opens the editor. */
  openFile: (file: File) => void
  /** Re-opens the editor with the previously loaded image. */
  reopen: () => boolean
  hasSource: () => boolean
  forgetSource: () => void
}

/** Longest edge of the working bitmap; keeps brushing and flood fill fast. */
const MAX_SOURCE_DIMENSION = 480
const MIN_SHAPE_CELLS = 4
/** Undo history depth; snapshots are one byte per pixel (≤ ~230 KB each). */
const MAX_HISTORY = 40
type ShapeTool = 'view' | 'keep' | 'remove' | 'wand'
interface ViewPointer {
  x: number
  y: number
}

export function initShapeEditor(options: ShapeEditorOptions): ShapeEditorApi {
  const editorRoot = query<HTMLElement>('#shape-editor')
  const backdrop = query<HTMLElement>('#shape-editor-backdrop')
  const meta = query<HTMLElement>('#shape-editor-meta')
  const closeButton = query<HTMLButtonElement>('#shape-editor-close')
  const zoomChip = query<HTMLButtonElement>('#shape-zoom-chip')
  const stage = query<HTMLElement>('#shape-editor-stage')
  const canvas = query<HTMLCanvasElement>('#shape-editor-canvas')
  const replaceButton = query<HTMLButtonElement>('#shape-replace-btn')
  const alphaNote = query<HTMLElement>('#shape-alpha-note')
  const thresholdField = query<HTMLElement>('#shape-threshold-field')
  const thresholdRange = query<HTMLInputElement>('#shape-threshold-range')
  const thresholdLabel = query<HTMLElement>('#shape-threshold-label')
  const viewButton = query<HTMLButtonElement>('#shape-tool-view')
  const brushKeepButton = query<HTMLButtonElement>('#shape-brush-keep')
  const brushRemoveButton = query<HTMLButtonElement>('#shape-brush-remove')
  const wandButton = query<HTMLButtonElement>('#shape-tool-wand')
  const brushField = query<HTMLElement>('#shape-brush-field')
  const wandField = query<HTMLElement>('#shape-wand-field')
  const brushRange = query<HTMLInputElement>('#shape-brush-range')
  const brushLabel = query<HTMLElement>('#shape-brush-label')
  const wandRange = query<HTMLInputElement>('#shape-wand-range')
  const wandLabel = query<HTMLElement>('#shape-wand-label')
  const selectAllButton = query<HTMLButtonElement>('#shape-select-all-btn')
  const invertButton = query<HTMLButtonElement>('#shape-invert-btn')
  const resetButton = query<HTMLButtonElement>('#shape-reset-btn')
  const undoButton = query<HTMLButtonElement>('#shape-undo-btn')
  const redoButton = query<HTMLButtonElement>('#shape-redo-btn')
  const colsInput = query<HTMLInputElement>('#shape-cols-input')
  const gridLabel = query<HTMLElement>('#shape-grid-label')
  const statCells = query<HTMLElement>('#shape-stat-cells')
  const statRegions = query<HTMLElement>('#shape-stat-regions')
  const connectivityLabel = query<HTMLElement>('#shape-connectivity')
  const keepLargestButton = query<HTMLButtonElement>('#shape-keep-largest-btn')
  const cancelButton = query<HTMLButtonElement>('#shape-cancel-btn')
  const applyButton = query<HTMLButtonElement>('#shape-apply-btn')
  const fileInput = query<HTMLInputElement>('#shape-file-input')
  const ctx = getContext2d(canvas)

  let sourceName = ''
  let sourceCanvas: HTMLCanvasElement | null = null
  let sourceImageData: ImageData | null = null
  let sourceHasAlpha = false
  let pixelMask: PixelMask | null = null
  let cellMask: CellMask = []
  let regionCount = 0
  let cellCount = 0
  let threshold = Number(thresholdRange.value)
  let tool: ShapeTool = 'keep'
  let brushCells = Number(brushRange.value)
  let wandTolerance = Number(wandRange.value)
  let cols = 60
  let rows = 60
  let painting = false
  let paintPointerId: number | null = null
  let lastPaintX = 0
  let lastPaintY = 0
  let cursorX = -1
  let cursorY = -1
  let overlayCanvas: HTMLCanvasElement | null = null
  let overlayDirty = true
  let renderQueued = false
  let undoStack: Uint8Array[] = []
  let redoStack: Uint8Array[] = []
  let lastHistoryTag = ''
  /** View transform: screen CSS px per bitmap px, plus pan in CSS px. */
  let viewScale = 1
  let viewPanX = 0
  let viewPanY = 0
  let fitScale = 1
  let panning = false
  let panPointerId: number | null = null
  let lastPanScreenX = 0
  let lastPanScreenY = 0
  let spaceHeld = false
  const viewPointers = new Map<number, ViewPointer>()
  let pinchDistance = 0
  let pinchCenterX = 0
  let pinchCenterY = 0

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (file) {
      openFile(file)
    }
    fileInput.value = ''
  })

  replaceButton.addEventListener('click', () => fileInput.click())
  closeButton.addEventListener('click', close)
  cancelButton.addEventListener('click', close)
  backdrop.addEventListener('click', close)
  window.addEventListener('keydown', (event) => {
    if (editorRoot.classList.contains('is-hidden')) {
      return
    }
    if (event.key === 'Escape') {
      close()
      return
    }
    if (event.code === 'Space' && !isTypingTarget(event.target)) {
      event.preventDefault()
      spaceHeld = true
      syncCanvasCursor()
      return
    }
    const isUndoCombo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z'
    const isRedoCombo = ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y')
      || (isUndoCombo && event.shiftKey)
    if (isRedoCombo) {
      event.preventDefault()
      redo()
    }
    else if (isUndoCombo) {
      event.preventDefault()
      undo()
    }
  })
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
      spaceHeld = false
      syncCanvasCursor()
    }
  })
  window.addEventListener('blur', () => {
    spaceHeld = false
    syncCanvasCursor()
  })

  zoomChip.addEventListener('click', () => {
    fitView()
    queueRender()
  })

  stage.addEventListener('wheel', (event) => {
    if (!pixelMask) {
      return
    }
    event.preventDefault()
    const rect = canvas.getBoundingClientRect()
    const anchorX = event.clientX - rect.left
    const anchorY = event.clientY - rect.top
    const factor = getWheelZoomFactor(event.deltaY, Math.max(1, cols, rows))
    const nextScale = clamp(viewScale * factor, fitScale * 0.25, fitScale * 24)
    viewPanX = anchorX - ((anchorX - viewPanX) / viewScale) * nextScale
    viewPanY = anchorY - ((anchorY - viewPanY) / viewScale) * nextScale
    viewScale = nextScale
    syncZoomChip()
    queueRender()
  }, { passive: false })

  thresholdRange.addEventListener('input', () => {
    threshold = Number(thresholdRange.value)
    thresholdLabel.textContent = String(threshold)
    // A slider drag fires many inputs; coalesce them into one undo entry.
    pushHistory('threshold')
    rerunAutoMask()
  })
  thresholdRange.addEventListener('change', () => {
    lastHistoryTag = ''
  })

  viewButton.addEventListener('click', () => setTool('view'))
  brushKeepButton.addEventListener('click', () => setTool('keep'))
  brushRemoveButton.addEventListener('click', () => setTool('remove'))
  wandButton.addEventListener('click', () => setTool('wand'))
  brushRange.addEventListener('input', () => {
    brushCells = Number(brushRange.value)
    brushLabel.textContent = `${brushCells} × ${brushCells} cells`
    queueRender()
  })
  wandRange.addEventListener('input', () => {
    wandTolerance = Number(wandRange.value)
    wandLabel.textContent = String(wandTolerance)
  })

  invertButton.addEventListener('click', () => {
    if (!pixelMask) {
      return
    }
    pushHistory()
    for (let index = 0; index < pixelMask.data.length; index += 1) {
      pixelMask.data[index] = pixelMask.data[index] ? 0 : 1
    }
    onMaskEdited()
  })

  selectAllButton.addEventListener('click', () => {
    if (!pixelMask) {
      return
    }
    pushHistory()
    pixelMask.data.fill(1)
    onMaskEdited()
  })

  resetButton.addEventListener('click', () => {
    pushHistory()
    rerunAutoMask()
  })

  undoButton.addEventListener('click', undo)
  redoButton.addEventListener('click', redo)

  colsInput.addEventListener('change', () => {
    const parsed = Number.parseInt(colsInput.value, 10)
    if (!Number.isFinite(parsed)) {
      colsInput.value = String(cols)
      return
    }
    cols = clamp(parsed, 4, GRID_DIMENSION_MAX)
    colsInput.value = String(cols)
    refreshDerivedState()
    queueRender()
  })

  keepLargestButton.addEventListener('click', () => {
    if (!pixelMask || regionCount <= 1) {
      return
    }
    pushHistory()
    const pruned = keepLargestMaskRegion(cellMask)
    prunePixelMaskToCells(pixelMask, pruned)
    onMaskEdited()
  })

  applyButton.addEventListener('click', () => {
    if (regionCount !== 1 || cellCount < MIN_SHAPE_CELLS || !sourceImageData || !pixelMask) {
      return
    }
    const startAndEndPoints = findFarthestMaskCells(cellMask)
    if (!startAndEndPoints) {
      return
    }
    options.onApply({
      cellColors: buildCellColors(sourceImageData, pixelMask, cellMask, cols, rows),
      cellMask: cellMask.map(line => [...line]),
      cols,
      end: startAndEndPoints.end,
      rows,
      start: startAndEndPoints.start,
    })
    close()
  })

  canvas.addEventListener('pointerdown', (event) => {
    if (!pixelMask) {
      return
    }
    if (event.button === 0 && tool === 'view') {
      event.preventDefault()
      canvas.setPointerCapture(event.pointerId)
      const point = getCanvasPointer(event)
      viewPointers.set(event.pointerId, point)
      if (viewPointers.size >= 2) {
        startPinchGesture()
      }
      else {
        panning = true
        panPointerId = event.pointerId
        lastPanScreenX = point.x
        lastPanScreenY = point.y
      }
      syncCanvasCursor()
      return
    }
    // Middle button, or space + left button, pans the view on desktop.
    if (event.button === 1 || (event.button === 0 && spaceHeld)) {
      event.preventDefault()
      panning = true
      panPointerId = event.pointerId
      canvas.setPointerCapture(event.pointerId)
      lastPanScreenX = event.clientX
      lastPanScreenY = event.clientY
      syncCanvasCursor()
      return
    }
    if (event.button !== 0) {
      return
    }
    const point = toBitmapPoint(event)
    if (tool === 'wand') {
      applyWand(point.x, point.y)
      return
    }
    pushHistory()
    painting = true
    paintPointerId = event.pointerId
    canvas.setPointerCapture(event.pointerId)
    lastPaintX = point.x
    lastPaintY = point.y
    paintStroke(point.x, point.y, point.x, point.y)
  })
  canvas.addEventListener('pointermove', (event) => {
    const viewPointer = viewPointers.get(event.pointerId)
    if (viewPointer) {
      event.preventDefault()
      const point = getCanvasPointer(event)
      viewPointer.x = point.x
      viewPointer.y = point.y
      if (viewPointers.size >= 2) {
        updatePinchGesture()
      }
      else if (panning && event.pointerId === panPointerId) {
        viewPanX += point.x - lastPanScreenX
        viewPanY += point.y - lastPanScreenY
        lastPanScreenX = point.x
        lastPanScreenY = point.y
        queueRender()
      }
      return
    }
    if (panning && event.pointerId === panPointerId) {
      viewPanX += event.clientX - lastPanScreenX
      viewPanY += event.clientY - lastPanScreenY
      lastPanScreenX = event.clientX
      lastPanScreenY = event.clientY
      queueRender()
      return
    }
    const point = toBitmapPoint(event)
    cursorX = point.x
    cursorY = point.y
    if (painting && event.pointerId === paintPointerId) {
      paintStroke(lastPaintX, lastPaintY, point.x, point.y)
      lastPaintX = point.x
      lastPaintY = point.y
    }
    else {
      queueRender()
    }
  })
  canvas.addEventListener('pointerleave', () => {
    cursorX = -1
    cursorY = -1
    queueRender()
  })
  const stopPointer = (event: PointerEvent): void => {
    if (viewPointers.delete(event.pointerId)) {
      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }
      if (viewPointers.size >= 2) {
        startPinchGesture()
      }
      else if (viewPointers.size === 1) {
        const [pointerId, point] = [...viewPointers.entries()][0]
        panning = true
        panPointerId = pointerId
        lastPanScreenX = point.x
        lastPanScreenY = point.y
        pinchDistance = 0
      }
      else {
        panning = false
        panPointerId = null
        pinchDistance = 0
      }
      syncCanvasCursor()
      return
    }
    if (panning && event.pointerId === panPointerId) {
      panning = false
      panPointerId = null
      syncCanvasCursor()
      return
    }
    if (!painting || event.pointerId !== paintPointerId) {
      return
    }
    painting = false
    paintPointerId = null
    refreshDerivedState()
    queueRender()
  }
  canvas.addEventListener('pointerup', stopPointer)
  canvas.addEventListener('pointercancel', stopPointer)

  new ResizeObserver(() => {
    if (!editorRoot.classList.contains('is-hidden')) {
      resizeCanvasToStage()
      fitView()
      queueRender()
    }
  }).observe(stage)

  function openFile(file: File): void {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      loadImage(image, file.name)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      options.showToast('Could not load that image.')
    }
    image.src = url
  }

  function loadImage(image: HTMLImageElement, name: string): void {
    const scale = Math.min(1, MAX_SOURCE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight))
    const width = Math.max(1, Math.round(image.naturalWidth * scale))
    const height = Math.max(1, Math.round(image.naturalHeight * scale))

    const working = document.createElement('canvas')
    working.width = width
    working.height = height
    const workingCtx = getContext2d(working)
    workingCtx.drawImage(image, 0, 0, width, height)

    sourceName = name
    sourceCanvas = working
    sourceImageData = workingCtx.getImageData(0, 0, width, height)
    sourceHasAlpha = hasAlphaPixels(sourceImageData)
    cols = clamp(options.getDefaultCols(), 4, GRID_DIMENSION_MAX)
    colsInput.value = String(cols)

    clearHistory()
    rerunAutoMask()
    open()
  }

  function rerunAutoMask(): void {
    if (!sourceImageData) {
      return
    }
    pixelMask = buildAutoPixelMask(sourceImageData, threshold)
    onMaskEdited()
  }

  function onMaskEdited(): void {
    overlayDirty = true
    refreshDerivedState()
    queueRender()
  }

  function refreshDerivedState(): void {
    if (!pixelMask) {
      return
    }
    rows = clamp(Math.max(1, Math.round((cols * pixelMask.height) / pixelMask.width)), 1, GRID_DIMENSION_MAX)
    cellMask = buildCellMask(pixelMask, cols, rows)
    const regions = findMaskRegions(cellMask)
    regionCount = regions.count
    cellCount = regions.cellCount
    overlayDirty = true
    syncFooter()
  }

  function syncFooter(): void {
    statCells.textContent = String(cellCount)
    statRegions.textContent = String(regionCount)
    gridLabel.textContent = `${cols} × ${rows} cells`
    meta.textContent = sourceName
      ? `${sourceName} · ${pixelMask?.width ?? 0}×${pixelMask?.height ?? 0}px`
      : ''

    const tooSmall = cellCount < MIN_SHAPE_CELLS
    const disconnected = regionCount > 1
    if (cellCount === 0) {
      connectivityLabel.textContent = 'Empty shape — keep some pixels first.'
      connectivityLabel.className = 'shape-connectivity is-error'
    }
    else if (disconnected) {
      connectivityLabel.textContent = `Disconnected — ${regionCount} regions found.`
      connectivityLabel.className = 'shape-connectivity is-error'
    }
    else if (tooSmall) {
      connectivityLabel.textContent = `Too small — needs at least ${MIN_SHAPE_CELLS} cells.`
      connectivityLabel.className = 'shape-connectivity is-error'
    }
    else {
      connectivityLabel.textContent = 'Connected — ready to apply.'
      connectivityLabel.className = 'shape-connectivity is-ok'
    }

    keepLargestButton.classList.toggle('is-hidden', !disconnected)
    applyButton.disabled = disconnected || tooSmall || cellCount === 0
  }

  function setTool(nextTool: ShapeTool): void {
    tool = nextTool
    viewButton.classList.toggle('is-active', nextTool === 'view')
    brushKeepButton.classList.toggle('is-active', nextTool === 'keep')
    brushRemoveButton.classList.toggle('is-active', nextTool === 'remove')
    wandButton.classList.toggle('is-active', nextTool === 'wand')
    brushField.classList.toggle('is-hidden', nextTool === 'wand' || nextTool === 'view')
    wandField.classList.toggle('is-hidden', nextTool !== 'wand')
    syncCanvasCursor()
    queueRender()
  }

  /** Removes the connected block of similar-colored cells under the click. */
  function applyWand(bitmapX: number, bitmapY: number): void {
    if (!sourceImageData || !pixelMask) {
      return
    }
    const col = clamp(Math.floor((bitmapX / pixelMask.width) * cols), 0, cols - 1)
    const row = clamp(Math.floor((bitmapY / pixelMask.height) * rows), 0, rows - 1)
    if (!cellMask[row]?.[col]) {
      return
    }
    pushHistory()
    removeSimilarCells(sourceImageData, pixelMask, cellMask, col, row, wandTolerance)
    onMaskEdited()
  }

  /**
   * Snapshots the pixel mask before a mutation. Consecutive edits sharing a
   * non-empty tag (e.g. a threshold slider drag) collapse into one entry.
   */
  function pushHistory(tag = ''): void {
    if (!pixelMask) {
      return
    }
    if (tag !== '' && tag === lastHistoryTag) {
      return
    }
    undoStack.push(pixelMask.data.slice())
    if (undoStack.length > MAX_HISTORY) {
      undoStack.shift()
    }
    redoStack = []
    lastHistoryTag = tag
    syncHistoryButtons()
  }

  function undo(): void {
    const snapshot = undoStack.pop()
    if (!snapshot || !pixelMask) {
      return
    }
    redoStack.push(pixelMask.data.slice())
    pixelMask.data.set(snapshot)
    lastHistoryTag = ''
    onMaskEdited()
    syncHistoryButtons()
  }

  function redo(): void {
    const snapshot = redoStack.pop()
    if (!snapshot || !pixelMask) {
      return
    }
    undoStack.push(pixelMask.data.slice())
    pixelMask.data.set(snapshot)
    lastHistoryTag = ''
    onMaskEdited()
    syncHistoryButtons()
  }

  function clearHistory(): void {
    undoStack = []
    redoStack = []
    lastHistoryTag = ''
    syncHistoryButtons()
  }

  function syncHistoryButtons(): void {
    undoButton.disabled = undoStack.length === 0
    redoButton.disabled = redoStack.length === 0
  }

  function toBitmapPoint(event: PointerEvent): MazePoint {
    const rect = canvas.getBoundingClientRect()
    const width = pixelMask?.width ?? 1
    const height = pixelMask?.height ?? 1
    return {
      x: clamp(Math.floor((event.clientX - rect.left - viewPanX) / viewScale), 0, width - 1),
      y: clamp(Math.floor((event.clientY - rect.top - viewPanY) / viewScale), 0, height - 1),
    }
  }

  function getCanvasPointer(event: PointerEvent): ViewPointer {
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  function startPinchGesture(): void {
    const [first, second] = [...viewPointers.values()]
    if (!first || !second) {
      return
    }
    pinchDistance = Math.hypot(second.x - first.x, second.y - first.y)
    pinchCenterX = (first.x + second.x) / 2
    pinchCenterY = (first.y + second.y) / 2
    panning = false
    panPointerId = null
  }

  function updatePinchGesture(): void {
    const [first, second] = [...viewPointers.values()]
    if (!first || !second) {
      return
    }
    const nextDistance = Math.hypot(second.x - first.x, second.y - first.y)
    const nextCenterX = (first.x + second.x) / 2
    const nextCenterY = (first.y + second.y) / 2
    if (pinchDistance <= 0 || nextDistance <= 0) {
      startPinchGesture()
      return
    }

    const nextScale = clamp(viewScale * (nextDistance / pinchDistance), fitScale * 0.25, fitScale * 24)
    const anchorBitmapX = (pinchCenterX - viewPanX) / viewScale
    const anchorBitmapY = (pinchCenterY - viewPanY) / viewScale
    viewPanX = nextCenterX - anchorBitmapX * nextScale
    viewPanY = nextCenterY - anchorBitmapY * nextScale
    viewScale = nextScale
    pinchDistance = nextDistance
    pinchCenterX = nextCenterX
    pinchCenterY = nextCenterY
    syncZoomChip()
    queueRender()
  }

  function paintStroke(fromX: number, fromY: number, toX: number, toY: number): void {
    if (!pixelMask) {
      return
    }
    const value = tool === 'keep' ? 1 : 0
    const stepSize = Math.max(1, pixelMask.width / cols / 2)
    const steps = Math.max(1, Math.ceil(Math.hypot(toX - fromX, toY - fromY) / stepSize))
    for (let step = 0; step <= steps; step += 1) {
      const x = fromX + ((toX - fromX) * step) / steps
      const y = fromY + ((toY - fromY) * step) / steps
      paintCellBlock(x, y, value)
    }
    cursorX = toX
    cursorY = toY
    overlayDirty = true
    queueRender()
  }

  interface CellBlock {
    startCol: number
    startRow: number
    endCol: number
    endRow: number
  }

  /** The brushCells×brushCells block of maze cells under a bitmap point. */
  function getBrushCellBlock(bitmapX: number, bitmapY: number): CellBlock | null {
    const mask = pixelMask
    if (!mask) {
      return null
    }
    const blockCells = tool === 'wand' ? 1 : brushCells
    const col = clamp(Math.floor((bitmapX / mask.width) * cols), 0, cols - 1)
    const row = clamp(Math.floor((bitmapY / mask.height) * rows), 0, rows - 1)
    const halfBefore = Math.floor((blockCells - 1) / 2)
    const startCol = clamp(col - halfBefore, 0, Math.max(0, cols - blockCells))
    const startRow = clamp(row - halfBefore, 0, Math.max(0, rows - blockCells))
    return {
      endCol: Math.min(cols - 1, startCol + blockCells - 1),
      endRow: Math.min(rows - 1, startRow + blockCells - 1),
      startCol,
      startRow,
    }
  }

  /**
   * Paints all pixels covered by the cell block under the point, using the
   * same cell/pixel boundaries as buildCellMask so edits flip whole cells.
   */
  function paintCellBlock(bitmapX: number, bitmapY: number, value: 0 | 1): void {
    const mask = pixelMask
    const block = getBrushCellBlock(bitmapX, bitmapY)
    if (!mask || !block) {
      return
    }
    const startX = Math.floor((block.startCol * mask.width) / cols)
    const endX = Math.max(startX + 1, Math.floor(((block.endCol + 1) * mask.width) / cols))
    const startY = Math.floor((block.startRow * mask.height) / rows)
    const endY = Math.max(startY + 1, Math.floor(((block.endRow + 1) * mask.height) / rows))

    for (let y = startY; y < endY; y += 1) {
      for (let x = startX; x < endX; x += 1) {
        mask.data[y * mask.width + x] = value
      }
    }
  }

  function open(): void {
    editorRoot.classList.remove('is-hidden')
    resizeCanvasToStage()
    fitView()
    queueRender()
  }

  function close(): void {
    editorRoot.classList.add('is-hidden')
    painting = false
    paintPointerId = null
    panning = false
    panPointerId = null
    spaceHeld = false
    viewPointers.clear()
    pinchDistance = 0
    syncCanvasCursor()
  }

  /** Matches the canvas backing store to the stage size; view fills stage. */
  function resizeCanvasToStage(): void {
    const stageRect = stage.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(stageRect.width * dpr))
    canvas.height = Math.max(1, Math.round(stageRect.height * dpr))
  }

  /** Fits and centers the bitmap in the stage; this is the 100% zoom. */
  function fitView(): void {
    if (!pixelMask) {
      return
    }
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const padding = 24
    fitScale = Math.min(
      Math.max(64, width - padding * 2) / pixelMask.width,
      Math.max(64, height - padding * 2) / pixelMask.height,
    )
    viewScale = fitScale
    viewPanX = (width - pixelMask.width * viewScale) / 2
    viewPanY = (height - pixelMask.height * viewScale) / 2
    syncZoomChip()
  }

  function syncZoomChip(): void {
    zoomChip.textContent = `${Math.round((viewScale / fitScale) * 100)}%`
  }

  function syncCanvasCursor(): void {
    canvas.style.cursor = panning ? 'grabbing' : spaceHeld || tool === 'view' ? 'grab' : 'crosshair'
  }

  function queueRender(): void {
    if (renderQueued) {
      return
    }
    renderQueued = true
    requestAnimationFrame(() => {
      renderQueued = false
      renderEditor()
    })
  }

  function renderEditor(): void {
    if (!sourceCanvas || !pixelMask) {
      return
    }

    alphaNote.classList.toggle('is-hidden', !sourceHasAlpha)
    thresholdField.classList.toggle('is-hidden', sourceHasAlpha)

    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)

    // Everything below draws in bitmap coordinates under the view transform.
    ctx.translate(viewPanX, viewPanY)
    ctx.scale(viewScale, viewScale)
    ctx.imageSmoothingEnabled = viewScale < 2
    ctx.drawImage(sourceCanvas, 0, 0)
    ctx.drawImage(ensureOverlay(), 0, 0)

    drawCellPreview()
    drawBrushCursor()
  }

  /** Overlay bitmap dimming removed pixels; rebuilt only after mask edits. */
  function ensureOverlay(): HTMLCanvasElement {
    if (!overlayCanvas) {
      overlayCanvas = document.createElement('canvas')
    }
    const mask = pixelMask!
    if (!overlayDirty && overlayCanvas.width === mask.width && overlayCanvas.height === mask.height) {
      return overlayCanvas
    }

    overlayCanvas.width = mask.width
    overlayCanvas.height = mask.height
    const overlayCtx = getContext2d(overlayCanvas)
    const overlay = overlayCtx.createImageData(mask.width, mask.height)
    for (let pixel = 0; pixel < mask.data.length; pixel += 1) {
      if (mask.data[pixel] === 0) {
        const offset = pixel * 4
        overlay.data[offset] = 0
        overlay.data[offset + 1] = 0
        overlay.data[offset + 2] = 0
        overlay.data[offset + 3] = 215
      }
    }
    overlayCtx.putImageData(overlay, 0, 0)
    overlayDirty = false
    return overlayCanvas
  }

  function drawCellPreview(): void {
    if (cellMask.length === 0 || !pixelMask) {
      return
    }
    const cellWidth = pixelMask.width / cols
    const cellHeight = pixelMask.height / rows
    const inset = 0.5 / viewScale

    ctx.fillStyle = 'rgba(143, 245, 255, 0.12)'
    ctx.strokeStyle = 'rgba(143, 245, 255, 0.35)'
    ctx.lineWidth = 1 / viewScale
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (!cellMask[row][col]) {
          continue
        }
        const x = col * cellWidth
        const y = row * cellHeight
        ctx.fillRect(x, y, cellWidth, cellHeight)
        ctx.strokeRect(x + inset, y + inset, cellWidth - inset * 2, cellHeight - inset * 2)
      }
    }
  }

  /** Square cursor snapped to the cell block the active tool targets. */
  function drawBrushCursor(): void {
    if (tool === 'view' || cursorX < 0 || !pixelMask) {
      return
    }
    const block = getBrushCellBlock(cursorX, cursorY)
    if (!block) {
      return
    }
    const cellWidth = pixelMask.width / cols
    const cellHeight = pixelMask.height / rows
    ctx.strokeStyle = tool === 'keep' ? 'rgba(143, 245, 255, 0.9)' : 'rgba(215, 51, 87, 0.9)'
    ctx.lineWidth = 1.5 / viewScale
    ctx.strokeRect(
      block.startCol * cellWidth,
      block.startRow * cellHeight,
      (block.endCol - block.startCol + 1) * cellWidth,
      (block.endRow - block.startRow + 1) * cellHeight,
    )
  }

  return {
    forgetSource: () => {
      close()
      sourceName = ''
      sourceCanvas = null
      sourceImageData = null
      pixelMask = null
      cellMask = []
      undoStack = []
      redoStack = []
    },
    hasSource: () => sourceCanvas !== null,
    openFile,
    reopen: () => {
      if (!sourceCanvas) {
        return false
      }
      open()
      return true
    },
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
}

function hasAlphaPixels(image: ImageData): boolean {
  for (let index = 3; index < image.data.length; index += 4) {
    if (image.data[index] < 250) {
      return true
    }
  }
  return false
}
