import type { PanelTab } from '../types'
import type { AppliedShape } from './shape-editor'
import { getGenerationAlgorithm } from '../algorithms'
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
  useViewportRatioInput,
} from '../dom'
import { key } from '../point'
import { fitMazeInView, render } from '../renderer'
import { clamp, GRID_DIMENSION_MAX, parseGridDimensionOptional } from '../utils'
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

export function setActiveTab(tab: PanelTab): void {
  if (app.running && tab === 'edit') {
    stopSolveAnimation()
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
    if (!app.hasCustomStartAndEndPoints) {
      applyDefaultSolvePoints()
    }
    if (shouldResetSolveStateForCurrentMaze()) {
      resetSolveState()
    }
    else {
      syncUi()
      render()
    }
    return
  }

  if (tab === 'edit') {
    prepareClosedMazeForEdit()
    syncUi()
    render()
    return
  }

  syncUi()
  render()
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

export function invalidateGenerationPreview(): void {
  if (app.generating) {
    return
  }

  clearGenerationPreviewState()
  syncGridDimensionInputs()
  syncStyleEditingVisibility()
  render()
}

export function applyShape(nextShape: AppliedShape): void {
  stopGenerationAnimation()
  stopSolveAnimation()
  clearGenerationPreviewState()

  app.shape = nextShape
  app.mazeWidth = nextShape.cols
  app.mazeHeight = nextShape.rows
  app.hasValidGridDimensions = true
  rebuildMazeForShapeChange()
  showToast(`Shape applied — ${nextShape.cols}×${nextShape.rows} grid.`)
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
  )
  app.maze = solidMazeState.maze
  app.mazeRuntime = solidMazeState.runtime
  app.hasCustomStartAndEndPoints = false
  app.hasGeneratedMaze = false
  app.stepState = createStepper(app.maze, app.mazeRuntime)
  app.solveCurrentHeadKey = key(app.stepState.start.x, app.stepState.start.y)

  if (app.activeTab === 'solve' || app.activeTab === 'edit') {
    switchTabsWithoutSideEffects('generate')
  }

  syncGridDimensionInputs()
  syncShapePanel()
  syncStyleEditingVisibility()
  fitMazeInView(app.maze)
  render()
}

export function syncShapePanel(): void {
  const activeShape = app.shape
  shapeStatus.textContent = activeShape
    ? `Shape active — ${activeShape.cols}×${activeShape.rows} cells.`
    : 'Full rectangle — upload an image to shape the maze.'
  shapeStatus.classList.toggle('is-shaped', activeShape !== null)
  shapeEditButton.classList.toggle('is-hidden', !app.shapeEditor?.hasSource())
  shapeClearButton.classList.toggle('is-hidden', activeShape === null)
  shapeColorsToggle.classList.toggle('is-hidden', activeShape === null)
}

export function syncGridDimensionInputs(changedBy: 'width' | 'height' | 'none' = 'none'): boolean {
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

  const nextWidth = parseGridDimensionOptional(mazeWidthInput.value)
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
    app.mazeHeight = clamp(Math.round(app.mazeWidth * ratio), 1, GRID_DIMENSION_MAX)
  }
  else if (app.lockGridRatio) {
    const ratio = app.lockedGridRatio > 0 ? app.lockedGridRatio : 1
    if (changedBy === 'height') {
      app.mazeHeight = resolvedHeight
      app.mazeWidth = clamp(Math.round(app.mazeHeight * ratio), 1, GRID_DIMENSION_MAX)
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
  const previousWidth = app.maze.cols || app.mazeWidth
  const previousHeight = app.maze.rows || app.mazeHeight
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
  )
  app.maze = solidMazeState.maze
  app.mazeRuntime = solidMazeState.runtime
  app.hasCustomStartAndEndPoints = false
  app.hasGeneratedMaze = false
  app.stepState = createStepper(app.maze, app.mazeRuntime)
  app.solveCurrentHeadKey = key(app.stepState.start.x, app.stepState.start.y)

  if (app.activeTab === 'solve' || app.activeTab === 'edit') {
    switchTabsWithoutSideEffects('generate')
  }

  return true
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
