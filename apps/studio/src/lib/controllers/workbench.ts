import type { MazeGridType, TriangleGridLayout } from 'mazely'
import type { PanelTab } from '../types'
import type { AppliedShape } from './shape-editor'
import { MAZE_GENERATION_CAPABILITIES, pointToCellId } from 'mazely'
import { getGenerationAlgorithm, shouldUseRandomGenerationStart } from '../algorithms'
import { app, createSolidMazeState } from '../app-state'
import {
  canvasWrap,
  dimensionGrid,
  generationSelect,
  lockGridRatioInput,
  mazeHeightField,
  mazeHeightInput,
  mazeWidthInput,
  mazeWidthLabel,
  shapeClearButton,
  shapeColorsToggle,
  shapeEditButton,
  shapeStatus,
  tabEdit,
  tabGenerate,
  tabPanelEdit,
  tabPanelGenerate,
  tabPanelSolve,
  tabSolve,
  triangleLayoutField,
  useViewportRatioInput,
  viewportRatioToggle,
} from '../dom'
import {
  getViewportRatioRows,
  TRIANGLE_RECTANGLE_VISUAL_COLS_MAX,
  triangleRectangleCellColsToVisualCols,
  triangleRectangleVisualColsToCellCols,
} from '../grid-geometry'
import { key } from '../point'
import { fitMazeInView, render } from '../renderer'
import { getRandomMaskPoint } from '../shape-mask'
import { clamp, GRID_DIMENSION_MAX, parseGridDimensionOptional } from '../utils'
import { cancelPointSelection, syncPointSelectionUi } from './maze-editor'
import {
  clearGenerationPreviewState,
  createStepper,
  resetSolveState,
  shouldResetSolveStateForCurrentMaze,
  stopGenerationAnimation,
  stopSolveAnimation,
} from './playback'
import { showToast, syncUi } from './status'
import { syncStyleEditingVisibility } from './theme-panel'

export function setActiveTab(tab: PanelTab, options: { preservePoints?: boolean } = {}): void {
  cancelPointSelection()
  if (app.running && tab === 'edit') {
    stopSolveAnimation()
  }

  if ((tab === 'solve' || tab === 'edit') && app.generationPreview?.committed) {
    clearGenerationPreviewState()
  }

  if ((tab === 'solve' || tab === 'edit') && !app.hasGeneratedMaze && tab !== 'edit') {
    showToast('Please generate or edit a maze first.')
    return
  }

  app.activeTab = tab

  tabGenerate.classList.toggle('is-active', tab === 'generate')
  tabSolve.classList.toggle('is-active', tab === 'solve')
  tabEdit.classList.toggle('is-active', tab === 'edit')
  tabPanelGenerate.classList.toggle('is-active', tab === 'generate')
  tabPanelSolve.classList.toggle('is-active', tab === 'solve')
  tabPanelEdit.classList.toggle('is-active', tab === 'edit')

  if ((tab === 'solve' || tab === 'edit') && app.generating) {
    stopGenerationAnimation()
  }

  if (tab === 'solve') {
    if (!options.preservePoints && app.solvePointMode === 'auto') {
      applyDefaultSolvePoints()
    }
    else if (!options.preservePoints) {
      applyManualSolvePoints()
    }
    if (shouldResetSolveStateForCurrentMaze()) {
      resetSolveState()
    }
    else {
      syncUi()
      render()
    }
    syncPointSelectionUi()
    return
  }

  if (tab === 'edit') {
    prepareClosedMazeForEdit()
    syncPointSelectionUi()
    syncUi()
    render()
    return
  }

  if (!options.preservePoints) {
    applyGenerationPointPreference()
  }
  syncPointSelectionUi()

  syncUi()
  render()
}

export function setGeneratePointMode(auto: boolean): void {
  cancelPointSelection()
  app.generatePointMode = auto ? 'auto' : 'manual'
  stopGenerationAnimation()
  clearGenerationPreviewState()
  applyGenerationPointPreference()
  if (app.mazeRuntime) {
    app.stepState = createStepper(app.maze, app.mazeRuntime)
  }
  syncPointSelectionUi()
  syncUi()
  render()
}

export function setSolvePointMode(auto: boolean): void {
  cancelPointSelection()
  app.solvePointMode = auto ? 'auto' : 'manual'
  if (auto) {
    applyDefaultSolvePoints()
  }
  else {
    applyManualSolvePoints()
  }
  resetSolveState()
  syncPointSelectionUi()
}

function applyGenerationPointPreference(): void {
  if (!app.mazeRuntime || app.generationPreview) {
    return
  }
  let start = app.generateManualStart
  if (app.generatePointMode === 'auto') {
    const algorithm = getGenerationAlgorithm(generationSelect.value)
    start = shouldUseRandomGenerationStart(algorithm)
      ? getAutomaticGenerationStart()
      : (app.shape?.start ?? { x: 0, y: 0 })
  }
  if (!app.mazeRuntime.grid.getCell(pointToCellId(start))) {
    start = app.shape?.start ?? { x: 0, y: 0 }
  }
  app.maze = { ...app.maze, start: { ...start } }
}

function getAutomaticGenerationStart() {
  if (app.shape) {
    return getRandomMaskPoint(app.shape.cellMask) ?? app.shape.start
  }
  const cells = app.mazeRuntime?.grid.cells ?? []
  const cell = cells[Math.floor(Math.random() * cells.length)]
  return cell ? { x: cell.col, y: cell.row } : { x: 0, y: 0 }
}

function prepareClosedMazeForEdit(): void {
  if (app.hasGeneratedMaze || !app.mazeRuntime) {
    return
  }

  if (app.solvePlayer && !app.solvePlayer.done) {
    app.solvePlayer.reset()
  }
  app.mazeRuntime.closeAllEdges()
  app.stepState = createStepper(app.maze, app.mazeRuntime)
  app.solveCurrentHeadKey = key(app.stepState.start.x, app.stepState.start.y)
}

function applyDefaultSolvePoints(): void {
  const height = app.maze.rows
  const width = app.maze.cols
  if (height === 0 || width === 0) {
    return
  }

  app.maze = {
    ...app.maze,
    cols: width,
    end: app.shape?.end ?? { x: width - 1, y: height - 1 },
    rows: height,
    start: app.shape?.start ?? { x: 0, y: 0 },
  }
}

function applyManualSolvePoints(): void {
  if (!app.mazeRuntime) {
    return
  }
  const start = app.mazeRuntime.grid.getCell(pointToCellId(app.solveManualStart))
    ? app.solveManualStart
    : (app.shape?.start ?? { x: 0, y: 0 })
  const end = app.mazeRuntime.grid.getCell(pointToCellId(app.solveManualEnd))
    ? app.solveManualEnd
    : (app.shape?.end ?? { x: app.maze.cols - 1, y: app.maze.rows - 1 })
  app.solveManualStart = { ...start }
  app.solveManualEnd = { ...end }
  app.maze = { ...app.maze, end: { ...end }, start: { ...start } }
}

export function invalidateGenerationPreview(): void {
  if (app.generating) {
    return
  }

  clearGenerationPreviewState()
  applyGenerationPointPreference()
  syncGridDimensionInputs()
  syncPointSelectionUi()
  syncStyleEditingVisibility()
  render()
}

export function applyShape(nextShape: AppliedShape): void {
  stopGenerationAnimation()
  stopSolveAnimation()
  clearGenerationPreviewState()

  app.shape = nextShape
  app.mazeWidth = app.gridType === 'triangle'
    ? app.triangleLayout === 'triangle'
      ? (nextShape.size ?? nextShape.rows)
      : triangleRectangleCellColsToVisualCols(nextShape.cols)
    : nextShape.cols
  app.mazeHeight = nextShape.rows
  app.hasValidGridDimensions = true
  rebuildMazeForShapeChange()
  showToast(app.gridType === 'triangle' && app.triangleLayout === 'triangle'
    ? `Shape applied — triangle size ${nextShape.size ?? nextShape.rows}.`
    : `Shape applied — ${nextShape.cols}×${nextShape.rows} grid.`)
}

export function clearShape(): void {
  if (!app.shape) {
    return
  }

  stopGenerationAnimation()
  stopSolveAnimation()
  clearGenerationPreviewState()

  app.shape = null
  rebuildMazeForShapeChange()
  showToast('Shape cleared.')
}

function rebuildMazeForShapeChange(): void {
  const solidMazeState = createSolidMazeState(
    app.mazeWidth,
    app.mazeHeight,
    getGenerationAlgorithm(generationSelect.value),
    app.shape,
    app.gridType,
    app.triangleLayout,
  )
  app.maze = solidMazeState.maze
  app.mazeRuntime = solidMazeState.runtime
  resetManualPointDrafts()
  app.hasGeneratedMaze = false
  app.stepState = createStepper(app.maze, app.mazeRuntime)
  app.solveCurrentHeadKey = key(app.stepState.start.x, app.stepState.start.y)

  if (app.activeTab === 'solve' || app.activeTab === 'edit') {
    switchTabsWithoutSideEffects('generate')
  }

  applyGenerationPointPreference()

  syncGridDimensionInputs()
  syncShapePanel()
  syncPointSelectionUi()
  syncStyleEditingVisibility()
  fitMazeInView(app.maze)
  render()
}

export function syncShapePanel(): void {
  const activeShape = app.shape
  shapeStatus.textContent = activeShape
    ? app.gridType === 'triangle' && app.triangleLayout === 'triangle'
      ? `Shape active — triangle size ${activeShape.size ?? activeShape.rows}.`
      : `Shape active — ${activeShape.cols}×${activeShape.rows} cells.`
    : 'Full grid — upload an image to shape the maze.'
  shapeStatus.classList.toggle('is-shaped', activeShape !== null)
  shapeEditButton.classList.toggle('is-hidden', !app.shapeEditor?.hasSource())
  shapeClearButton.classList.toggle('is-hidden', activeShape === null)
  shapeColorsToggle.classList.toggle('is-hidden', activeShape === null)
}

export function setGridType(gridType: MazeGridType): void {
  if (app.gridType === gridType) {
    return
  }
  stopGenerationAnimation()
  stopSolveAnimation()
  clearGenerationPreviewState()
  app.gridType = gridType
  if (gridType === 'triangle' && app.triangleLayout === 'rectangle') {
    app.mazeWidth = clamp(app.mazeWidth, 1, TRIANGLE_RECTANGLE_VISUAL_COLS_MAX)
  }
  app.shape = null
  app.useViewportRatio = false
  app.lockGridRatio = false
  useViewportRatioInput.checked = false
  lockGridRatioInput.checked = false
  triangleLayoutField.classList.toggle('is-hidden', gridType !== 'triangle')

  const selected = getGenerationAlgorithm(generationSelect.value)
  if (!(MAZE_GENERATION_CAPABILITIES[selected].supportedGridTypes as readonly string[]).includes(gridType)) {
    generationSelect.value = 'dfs'
  }
  for (const option of Array.from(generationSelect.options)) {
    const algorithm = getGenerationAlgorithm(option.value)
    option.disabled = !(MAZE_GENERATION_CAPABILITIES[algorithm].supportedGridTypes as readonly string[])
      .includes(gridType)
  }

  rebuildMazeForShapeChange()
  showToast(`${gridType === 'triangle' ? 'Triangle' : 'Square'} grid selected.`)
}

export function setTriangleLayout(layout: TriangleGridLayout): void {
  if (app.triangleLayout === layout || app.gridType !== 'triangle') {
    return
  }
  stopGenerationAnimation()
  stopSolveAnimation()
  clearGenerationPreviewState()
  app.triangleLayout = layout
  if (layout === 'rectangle') {
    app.mazeWidth = clamp(app.mazeWidth, 1, TRIANGLE_RECTANGLE_VISUAL_COLS_MAX)
  }
  app.shape = null
  rebuildMazeForShapeChange()
  showToast(`${layout === 'triangle' ? 'Triangular' : 'Rectangular'} layout selected.`)
}

export function syncGridDimensionInputs(changedBy: 'width' | 'height' | 'none' = 'none'): boolean {
  if (app.gridType === 'triangle' && app.triangleLayout === 'triangle') {
    const size = app.shape?.size ?? (app.shape ? app.shape.rows : parseGridDimensionOptional(mazeWidthInput.value))
    app.useViewportRatio = false
    app.lockGridRatio = false
    useViewportRatioInput.checked = false
    lockGridRatioInput.checked = false
    mazeWidthInput.disabled = app.shape !== null
    mazeWidthInput.max = String(GRID_DIMENSION_MAX)
    useViewportRatioInput.disabled = true
    lockGridRatioInput.disabled = true
    mazeHeightInput.disabled = true
    mazeHeightField.classList.add('is-hidden')
    dimensionGrid.classList.add('is-ratio')
    viewportRatioToggle.classList.add('is-hidden')
    mazeWidthLabel.textContent = 'SIZE (SIDE)'
    if (size == null) {
      return false
    }
    app.mazeWidth = size
    app.mazeHeight = size
    mazeWidthInput.value = String(size)
    mazeHeightInput.value = String(size)
    return true
  }

  const widthMax = app.gridType === 'triangle' && app.triangleLayout === 'rectangle'
    ? TRIANGLE_RECTANGLE_VISUAL_COLS_MAX
    : GRID_DIMENSION_MAX
  mazeWidthInput.max = String(widthMax)
  viewportRatioToggle.classList.remove('is-hidden')
  const shapeLocked = app.shape !== null
  mazeWidthInput.disabled = shapeLocked
  useViewportRatioInput.disabled = shapeLocked
  if (shapeLocked) {
    // The shape fixes the grid: dimensions were set when it was applied.
    mazeHeightInput.disabled = true
    lockGridRatioInput.disabled = true
    mazeHeightField.classList.remove('is-hidden')
    dimensionGrid.classList.remove('is-ratio')
    mazeWidthLabel.textContent = 'WIDTH'
    mazeWidthInput.value = String(app.mazeWidth)
    mazeHeightInput.value = String(app.mazeHeight)
    return true
  }

  const parsedWidth = parseGridDimensionOptional(mazeWidthInput.value)
  const nextWidth = parsedWidth == null ? null : clamp(parsedWidth, 1, widthMax)
  const nextHeight = parseGridDimensionOptional(mazeHeightInput.value)
  const missingDimension = nextWidth == null || (!app.useViewportRatio && nextHeight == null)

  app.lockGridRatio = lockGridRatioInput.checked
  mazeHeightInput.disabled = app.useViewportRatio
  mazeHeightField.classList.toggle('is-hidden', app.useViewportRatio)
  dimensionGrid.classList.toggle('is-ratio', app.useViewportRatio)
  mazeWidthLabel.textContent = app.useViewportRatio ? 'SIZE' : 'WIDTH'
  lockGridRatioInput.disabled = app.useViewportRatio

  if (missingDimension) {
    return false
  }

  const resolvedWidth = nextWidth ?? app.mazeWidth
  const resolvedHeight = nextHeight ?? app.mazeHeight

  app.mazeWidth = resolvedWidth
  if (app.useViewportRatio) {
    const ratio = getViewportHeightWidthRatio()
    app.mazeHeight = clamp(
      getViewportRatioRows(
        app.gridType === 'triangle'
          ? triangleRectangleVisualColsToCellCols(app.mazeWidth)
          : app.mazeWidth,
        ratio,
        app.gridType,
      ),
      1,
      GRID_DIMENSION_MAX,
    )
  }
  else if (app.lockGridRatio) {
    const ratio = app.lockedGridRatio > 0 ? app.lockedGridRatio : 1
    if (changedBy === 'height') {
      app.mazeHeight = resolvedHeight
      app.mazeWidth = clamp(Math.round(app.mazeHeight * ratio), 1, widthMax)
    }
    else {
      app.mazeWidth = resolvedWidth
      app.mazeHeight = clamp(Math.round(app.mazeWidth / ratio), 1, GRID_DIMENSION_MAX)
    }
  }
  else {
    app.mazeHeight = resolvedHeight
    if (app.mazeHeight > 0) {
      app.lockedGridRatio = app.mazeWidth / app.mazeHeight
    }
  }

  mazeWidthInput.value = String(app.mazeWidth)
  mazeHeightInput.value = String(app.mazeHeight)
  return true
}

function getViewportHeightWidthRatio(): number {
  const rect = canvasWrap.getBoundingClientRect()
  if (rect.width <= 0) {
    return 1
  }

  return rect.height / rect.width
}

export function applyGridDimensionChange(changedBy: 'width' | 'height' | 'none' = 'none'): boolean {
  if (app.shape) {
    return false
  }

  const wasValid = app.hasValidGridDimensions
  const previousWidth = app.gridType === 'triangle'
    ? (app.maze.cols + 1) / 2
    : (app.maze.cols || app.mazeWidth)
  const previousHeight = app.gridType === 'triangle'
    ? app.maze.rows
    : (app.maze.rows || app.mazeHeight)
  const valid = syncGridDimensionInputs(changedBy)

  if (!valid) {
    stopGenerationAnimation()
    stopSolveAnimation()
    clearGenerationPreviewState()
    app.hasValidGridDimensions = false
    return wasValid
  }

  app.hasValidGridDimensions = true

  if (previousWidth === app.mazeWidth && previousHeight === app.mazeHeight) {
    return !wasValid
  }

  stopGenerationAnimation()
  stopSolveAnimation()
  clearGenerationPreviewState()

  const solidMazeState = createSolidMazeState(
    app.mazeWidth,
    app.mazeHeight,
    getGenerationAlgorithm(generationSelect.value),
    app.shape,
    app.gridType,
    app.triangleLayout,
  )
  app.maze = solidMazeState.maze
  app.mazeRuntime = solidMazeState.runtime
  resetManualPointDrafts()
  app.hasGeneratedMaze = false
  app.stepState = createStepper(app.maze, app.mazeRuntime)
  app.solveCurrentHeadKey = key(app.stepState.start.x, app.stepState.start.y)

  if (app.activeTab === 'solve' || app.activeTab === 'edit') {
    switchTabsWithoutSideEffects('generate')
  }

  applyGenerationPointPreference()
  syncPointSelectionUi()

  return true
}

function resetManualPointDrafts(): void {
  app.generateManualStart = { ...app.maze.start }
  app.solveManualStart = { ...app.maze.start }
  app.solveManualEnd = { ...app.maze.end }
}

function switchTabsWithoutSideEffects(tab: PanelTab): void {
  app.activeTab = tab
  tabGenerate.classList.toggle('is-active', tab === 'generate')
  tabSolve.classList.toggle('is-active', tab === 'solve')
  tabEdit.classList.toggle('is-active', tab === 'edit')
  tabPanelGenerate.classList.toggle('is-active', tab === 'generate')
  tabPanelSolve.classList.toggle('is-active', tab === 'solve')
  tabPanelEdit.classList.toggle('is-active', tab === 'edit')
}
