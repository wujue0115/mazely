import { getGenerationAlgorithm } from '../algorithms'
import { app } from '../app-state'
import {
  getGenerationTrailKeys,
  isGenerationPreviewVisible,
} from '../derived'
import {
  editEndReadout,
  editStartReadout,
  exportSvgButton,
  generationSelect,
  loadMazeButton,
  lockGridRatioInput,
  mazeHeightInput,
  mazeWidthInput,
  pathText,
  resetButton,
  runButton,
  saveMazeButton,
  solveEndPoint,
  solveEndReadout,
  solvePointsGrid,
  solvePointsInfo,
  solvePointsLabel,
  solveStartReadout,
  solvingSelect,
  speedLabel,
  statusText,
  stepButton,
  toast,
  useViewportRatioInput,
  visitedText,
  wallLabel,
} from '../dom'
import { syncStyleEditingVisibility } from './theme-panel'
import { syncUiState } from './ui'

let toastTimer = 0
let lastUiSyncTimestamp = 0

export function showToast(message: string): void {
  toast.textContent = message
  toast.classList.add('is-visible')

  if (toastTimer !== 0) {
    window.clearTimeout(toastTimer)
  }

  toastTimer = window.setTimeout(() => {
    toast.classList.remove('is-visible')
    toastTimer = 0
  }, 1800)
}

export function syncUi(): void {
  const floodAlgorithm = app.stepState.algorithm === 'flood'
  solveStartReadout.textContent = `${app.maze.start.x}, ${app.maze.start.y}`
  solveEndReadout.textContent = `${app.maze.end.x}, ${app.maze.end.y}`
  solveEndPoint.classList.toggle('is-hidden', floodAlgorithm)
  solvePointsGrid.classList.toggle('is-start-only', floodAlgorithm)
  solvePointsInfo.classList.toggle('is-hidden', floodAlgorithm)
  solvePointsLabel.textContent = floodAlgorithm ? 'Start Point' : 'Start / End Points'
  editStartReadout.textContent = `${app.maze.start.x}, ${app.maze.start.y}`
  editEndReadout.textContent = `${app.maze.end.x}, ${app.maze.end.y}`

  const generationTotalCells = app.generationPreview
    ? app.generationPreview.runtime.grid.cells.length
    : 0
  const partialSolve = app.stepState.status === 'running' && app.stepState.visitedCount > 0
  loadMazeButton.disabled = app.generating || app.running
  saveMazeButton.disabled = app.generating
    || app.running
    || !app.hasGeneratedMaze
    || app.generationPreview !== null
    || partialSolve

  syncUiState({
    activeTab: app.activeTab,
    generating: app.generating,
    generationPreviewAlgorithm: app.generationPreview?.algorithm ?? getGenerationAlgorithm(generationSelect.value),
    generationStepIndex: app.generationPreview?.player.index ?? 0,
    generationStepTotal: app.generationPreview?.player.total ?? 0,
    generationTotalCells,
    floodAlgorithm,
    exportSvgButton,
    getGenerationTrailKeysSize: () => getGenerationTrailKeys().size,
    hasGenerationPreviewVisible: isGenerationPreviewVisible(),
    heightInput: mazeHeightInput,
    lockRatioInput: lockGridRatioInput,
    resetButton,
    runButton,
    running: app.running,
    shapeLocked: app.shape !== null,
    solvingSelect,
    speedLabel,
    statPath: pathText,
    statusText,
    statVisited: visitedText,
    stepBatchSize: app.stepBatchSize,
    stepButton,
    stepDelay: app.stepDelay,
    stepState: app.stepState,
    styleEditingVisibility: syncStyleEditingVisibility,
    useViewportRatio: app.useViewportRatio,
    viewportRatioInput: useViewportRatioInput,
    visitedGenerationCount: app.generationPreview?.discoveredCount ?? 0,
    wallLabel,
    wallThickness: app.wallThickness,
    widthInput: mazeWidthInput,
  })
}

export function maybeSyncUi(): void {
  if (!app.running && !app.generating) {
    syncUi()
    return
  }

  const now = performance.now()
  if (now - lastUiSyncTimestamp < 50) {
    return
  }

  lastUiSyncTimestamp = now
  syncUi()
}
