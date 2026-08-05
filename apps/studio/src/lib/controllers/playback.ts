import type { Maze } from 'mazely'
import type { MazePoint, MazeViewState } from '../maze-types'
import type { SolveState } from '../solver-state'
import type { GenerationPreview } from './generation'
import { createMaze } from 'mazely'
import {
  getGenerationAlgorithm,
  getSolvingAlgorithm,
  shouldUseRandomGenerationStart,
} from '../algorithms'
import {
  app,
  createInitialSolveState,
  createMazeViewState,
} from '../app-state'
import { bumpGenerationCacheVersion, bumpSolveCacheVersion } from '../derived'
import { generationSelect, solvingSelect, speedRange } from '../dom'
import { key, parsePointKey } from '../point'
import { render } from '../renderer'
import { getRandomMaskPoint } from '../shape-mask'
import { applySolveStepToState, rebuildSolveVisualState } from '../solver-state'
import { getRandomMazePoint, parseRange } from '../utils'
import {
  advanceGenerationPreview,
  createGenerationPreview,
  isGenerationPreviewDone,
  rebuildGenerationPreview,
} from './generation'
import { showToast, syncUi } from './status'
import { syncStyleEditingVisibility } from './theme-panel'
import { computeLoopSpeed, getSolveRunAction, getSolveStepAction } from './ui'
import { syncGridDimensionInputs } from './workbench'

export function syncLoopSpeed(): void {
  const rawValue = parseRange(speedRange.value, 20)
  const result = computeLoopSpeed(rawValue)
  app.stepDelay = result.stepDelay
  app.stepBatchSize = result.stepBatchSize
}

export function createStepper(inputMaze: MazeViewState, runtime: Maze): SolveState {
  const algorithm = getSolvingAlgorithm(solvingSelect.value)
  app.solveRuntime = runtime
  app.floodDepthByKey = {}
  app.solvePlayer = algorithm === 'flood'
    ? runtime.solve('flood', {
        start: { ...inputMaze.start },
      })
    : runtime.solve(algorithm, {
        end: { ...inputMaze.end },
        start: { ...inputMaze.start },
      })
  bumpSolveCacheVersion()
  return createInitialSolveState(algorithm, inputMaze.start, inputMaze.end)
}

/**
 * Applies one real solve step and folds its payload into the incremental
 * solve state. Returns false when the solver has no steps left.
 */
function advanceSolveState(): boolean {
  if (!app.solvePlayer || !app.solveRuntime) {
    return false
  }

  const stepIndex = app.solvePlayer.index
  if (!app.solvePlayer.next()) {
    return false
  }

  const step = app.solvePlayer.steps[stepIndex]
  const visual = applySolveStepToState(app.stepState, step, app.solveCurrentHeadKey)
  app.solveCurrentHeadKey = visual.currentHeadKey
  if (visual.floodVisit) {
    app.floodDepthByKey[visual.floodVisit.pointKey] = visual.floodVisit.depth
  }

  if (app.solvePlayer.done) {
    finalizeSolveState()
  }
  bumpSolveCacheVersion()
  return true
}

function finalizeSolveState(): void {
  const result = app.solveRuntime?.getSolveResult()
  app.stepState.frontier.clear()
  app.stepState.frontierSize = 0
  app.stepState.path = result?.path ?? []
  app.stepState.status = result?.solved ? 'solved' : 'unsolved'
  if (!result?.solved) {
    showToast('No solution found.')
  }
}

export function shouldResetSolveStateForCurrentMaze(): boolean {
  const targetAlgorithm = getSolvingAlgorithm(solvingSelect.value)
  if (app.stepState.algorithm !== targetAlgorithm) {
    return true
  }

  if (app.stepState.start.x !== app.maze.start.x || app.stepState.start.y !== app.maze.start.y) {
    return true
  }

  if (
    targetAlgorithm !== 'flood'
    && (app.stepState.end.x !== app.maze.end.x || app.stepState.end.y !== app.maze.end.y)
  ) {
    return true
  }

  return false
}

export function resetSolveState(): void {
  if (app.generating || !app.mazeRuntime) {
    return
  }

  stopSolveAnimation()
  app.stepState = createStepper(app.maze, app.mazeRuntime)
  app.solveCurrentHeadKey = key(app.stepState.start.x, app.stepState.start.y)
  syncStyleEditingVisibility()
  render()
}

function createCurrentMaze(): GenerationPreview {
  syncGridDimensionInputs()
  const generationAlgorithm = getGenerationAlgorithm(generationSelect.value)
  const randomStart = shouldUseRandomGenerationStart(generationAlgorithm)
    ? getRandomGenerationStart()
    : undefined

  const runtime = createMaze({
    grid: { cols: app.mazeWidth, mask: app.shape?.cellMask, rows: app.mazeHeight, type: 'square' },
  })
  const start = randomStart ?? app.shape?.start ?? { x: 0, y: 0 }
  const end = app.shape?.end ?? { x: app.mazeWidth - 1, y: app.mazeHeight - 1 }
  const player = runtime.generate(generationAlgorithm, { start })

  return createGenerationPreview({
    algorithm: generationAlgorithm,
    player,
    runtime,
    view: createMazeViewState(app.mazeWidth, app.mazeHeight, generationAlgorithm, start, end),
  })
}

function getRandomGenerationStart(): MazePoint {
  if (app.shape) {
    return getRandomMaskPoint(app.shape.cellMask) ?? app.shape.start
  }
  return getRandomMazePoint(app.mazeWidth, app.mazeHeight)
}

export function onRunAction(): void {
  syncLoopSpeed()

  if (app.activeTab === 'generate') {
    toggleGenerateRun()
    return
  }

  toggleSolveRun()
}

export function onStepAction(): void {
  if (app.activeTab === 'generate') {
    stepGenerateOnce()
    return
  }

  stepSolveOnce()
}

export function onPreviousStepAction(): void {
  if (app.activeTab === 'generate') {
    stepGeneratePreviousOnce()
    return
  }

  stepSolvePreviousOnce()
}

export function onResetAction(): void {
  if (app.activeTab === 'generate') {
    resetGenerationPreview()
    return
  }

  resetSolveState()
}

function toggleGenerateRun(): void {
  if (app.generating) {
    stopGenerationAnimation()
    render()
    return
  }

  if (app.running) {
    stopSolveAnimation()
  }

  if (app.generationPreview?.committed && isGenerationAnimationDone()) {
    clearGenerationPreviewState()
  }

  ensureGenerationPreview()
  startGenerationAnimation()
}

function stepGenerateOnce(): void {
  if (app.generating) {
    return
  }

  if (app.running) {
    stopSolveAnimation()
  }

  if (app.generationPreview?.committed && isGenerationAnimationDone()) {
    clearGenerationPreviewState()
  }

  ensureGenerationPreview()

  if (!advanceGenerationStep()) {
    finishGenerationAnimation()
    return
  }

  if (isGenerationAnimationDone()) {
    finishGenerationAnimation()
    return
  }

  render()
}

function stepGeneratePreviousOnce(): void {
  const preview = app.generationPreview
  if (app.generating || !preview || preview.player.index === 0) {
    return
  }

  if (app.running) {
    stopSolveAnimation()
  }

  if (!preview.player.prev()) {
    return
  }

  rebuildGenerationPreview(preview)
  rebuildGenerationDiscoveredMask(preview)
  if (preview.committed) {
    app.mazeEditVersion += 1
  }
  bumpGenerationCacheVersion()
  render()
}

function resetGenerationPreview(): void {
  stopGenerationAnimation()
  clearGenerationPreviewState()
  render()
}

function ensureGenerationPreview(): void {
  if (app.generationPreview) {
    return
  }

  const preview = createCurrentMaze()
  app.generationPreview = preview
  app.generationLastTimestamp = 0
  app.generationElapsed = 0
  resetGenerationDiscoveredMask(preview.runtime)
  bumpGenerationCacheVersion()
}

function startGenerationAnimation(): void {
  if (!app.generationPreview || app.generating) {
    return
  }

  if (isGenerationAnimationDone()) {
    finishGenerationAnimation()
    return
  }

  app.generating = true
  app.generationFrame = window.requestAnimationFrame(generationLoop)
  syncUi()
}

export function stopGenerationAnimation(): void {
  if (!app.generating) {
    return
  }

  app.generating = false
  window.cancelAnimationFrame(app.generationFrame)
  app.generationFrame = 0
  app.generationLastTimestamp = 0
  app.generationElapsed = 0
  syncUi()
}

function generationLoop(timestamp: number): void {
  if (!app.generating) {
    return
  }

  if (app.generationLastTimestamp === 0) {
    app.generationLastTimestamp = timestamp
  }

  app.generationElapsed += timestamp - app.generationLastTimestamp
  app.generationLastTimestamp = timestamp

  let frameAdvanced = false
  while (app.generationElapsed >= app.stepDelay && !isGenerationAnimationDone()) {
    let advanced = false
    for (let step = 0; step < app.stepBatchSize && !isGenerationAnimationDone(); step += 1) {
      if (!advanceGenerationStep()) {
        break
      }
      advanced = true
      frameAdvanced = true
    }

    if (!advanced) {
      break
    }

    app.generationElapsed -= app.stepDelay
  }

  if (frameAdvanced) {
    render()
  }

  if (isGenerationAnimationDone()) {
    finishGenerationAnimation()
    return
  }

  app.generationFrame = window.requestAnimationFrame(generationLoop)
}

function advanceGenerationStep(): boolean {
  if (!app.generationPreview) {
    return false
  }

  const discovered = advanceGenerationPreview(app.generationPreview)
  if (discovered === null) {
    return false
  }

  for (const point of discovered) {
    setGenerationDiscoveredMask(point.x, point.y)
  }
  if (app.generationPreview.committed) {
    app.mazeEditVersion += 1
  }
  bumpGenerationCacheVersion()
  return true
}

function finishGenerationAnimation(): void {
  if (!app.generationPreview) {
    return
  }

  app.generationPreview.player.finish()
  app.maze = app.generationPreview.view
  app.mazeRuntime = app.generationPreview.runtime
  app.hasCustomStartAndEndPoints = false
  app.hasGeneratedMaze = true
  app.generationPreview.committed = true
  app.stepState = createStepper(app.maze, app.mazeRuntime)
  app.solveCurrentHeadKey = key(app.stepState.start.x, app.stepState.start.y)

  stopGenerationAnimation()
  render()
}

export function clearGenerationPreviewState(): void {
  const preview = app.generationPreview
  if (preview?.committed) {
    preview.player.finish()
    app.maze = preview.view
    app.mazeRuntime = preview.runtime
    app.hasCustomStartAndEndPoints = false
    app.hasGeneratedMaze = true
    app.mazeEditVersion += 1
    app.stepState = createStepper(app.maze, app.mazeRuntime)
    app.solveCurrentHeadKey = key(app.stepState.start.x, app.stepState.start.y)
  }

  app.generationPreview = null
  app.generationLastTimestamp = 0
  app.generationElapsed = 0
  app.generationDiscoveredMask = new Uint8Array(0)
  app.generationMaskCols = 0
  app.generationMaskRows = 0
  bumpGenerationCacheVersion()
}

function isGenerationAnimationDone(): boolean {
  return app.generationPreview !== null && isGenerationPreviewDone(app.generationPreview)
}

function resetGenerationDiscoveredMask(targetRuntime: Maze): void {
  const { cols, rows } = targetRuntime.grid
  app.generationMaskRows = rows
  app.generationMaskCols = cols
  app.generationDiscoveredMask = new Uint8Array(rows * cols)
}

function setGenerationDiscoveredMask(x: number, y: number): void {
  if (x < 0 || y < 0 || x >= app.generationMaskCols || y >= app.generationMaskRows) {
    return
  }
  app.generationDiscoveredMask[y * app.generationMaskCols + x] = 1
}

function rebuildGenerationDiscoveredMask(preview: GenerationPreview): void {
  resetGenerationDiscoveredMask(preview.runtime)
  for (const pointKey of preview.discoveredKeys) {
    const point = parsePointKey(pointKey)
    setGenerationDiscoveredMask(point.x, point.y)
  }
}

function toggleSolveRun(): void {
  const action = getSolveRunAction(app.running, app.stepState.status)
  if (action === 'pause') {
    stopSolveAnimation()
    return
  }

  if (app.generating) {
    return
  }

  if (action === 'restart') {
    resetSolveState()
  }

  app.running = true
  app.solveElapsed = 0
  app.solveLastTimestamp = 0
  app.solveAnimationFrame = window.requestAnimationFrame(solveLoop)
  syncUi()
  if (app.stepState.algorithm === 'flood') {
    render()
  }
}

function stepSolveOnce(): void {
  if (app.generating) {
    return
  }

  if (app.running) {
    return
  }

  if (getSolveStepAction(app.stepState.status) === 'restart') {
    resetSolveState()
  }

  if (!advanceSolveState()) {
    return
  }
  render()
}

function stepSolvePreviousOnce(): void {
  if (app.generating || app.running || !app.solvePlayer || app.solvePlayer.index === 0) {
    return
  }

  if (!app.solvePlayer.prev()) {
    return
  }

  const rebuilt = rebuildSolveVisualState({
    algorithm: app.stepState.algorithm,
    end: app.stepState.end,
    start: app.stepState.start,
    steps: app.solvePlayer.steps.slice(0, app.solvePlayer.index),
  })
  app.stepState = rebuilt.state
  app.solveCurrentHeadKey = rebuilt.currentHeadKey
  app.floodDepthByKey = rebuilt.floodDepthByKey
  bumpSolveCacheVersion()
  render()
}

export function stopSolveAnimation(): void {
  if (!app.running) {
    return
  }

  app.running = false
  window.cancelAnimationFrame(app.solveAnimationFrame)
  app.solveAnimationFrame = 0
  app.solveElapsed = 0
  app.solveLastTimestamp = 0
  syncUi()
}

function solveLoop(timestamp: number): void {
  if (!app.running) {
    return
  }

  if (app.solveLastTimestamp === 0) {
    app.solveLastTimestamp = timestamp
  }

  app.solveElapsed += timestamp - app.solveLastTimestamp
  app.solveLastTimestamp = timestamp

  let frameAdvanced = false
  while (app.solveElapsed >= app.stepDelay && app.stepState.status === 'running') {
    let advanced = false
    for (let step = 0; step < app.stepBatchSize && app.stepState.status === 'running'; step += 1) {
      if (!advanceSolveState()) {
        break
      }
      advanced = true
      frameAdvanced = true
    }

    if (!advanced) {
      break
    }

    app.solveElapsed -= app.stepDelay
  }

  if (frameAdvanced) {
    render()
  }

  if (app.stepState.status !== 'running') {
    stopSolveAnimation()
    return
  }

  app.solveAnimationFrame = window.requestAnimationFrame(solveLoop)
}
