import type { MazeGenerationAlgorithm } from '../maze-types'

import type { SolveState } from '../solver-state'
import type { PanelTab } from '../types'
import { clamp } from '../utils'

export interface LoopSpeedResult {
  stepBatchSize: number
  stepDelay: number
}

export function computeLoopSpeed(rawValue: number): LoopSpeedResult {
  const normalized = clamp(Math.round(rawValue), 1, 3000)

  return {
    stepBatchSize: 1,
    stepDelay: normalized,
  }
}

export type SolveRunAction = 'pause' | 'restart' | 'start'
export type SolveStepAction = 'restart' | 'step'

export interface StepButtonState {
  previousDisabled: boolean
  stepDisabled: boolean
}

export type GenerationPlaybackStatus = 'generated' | 'generating' | 'generation-ready' | 'idle'

export function getGenerationPlaybackStatus(options: {
  generating: boolean
  generationDone: boolean
  hasGeneratedMaze: boolean
  hasGenerationPreview: boolean
}): GenerationPlaybackStatus {
  if (options.generating) {
    return 'generating'
  }
  if (options.hasGeneratedMaze && (!options.hasGenerationPreview || options.generationDone)) {
    return 'generated'
  }
  return options.hasGenerationPreview ? 'generation-ready' : 'idle'
}

export function getStepButtonState(options: {
  activeTab: PanelTab
  generating: boolean
  generationDone: boolean
  generationStepIndex: number
  running: boolean
  solveStepIndex: number
}): StepButtonState {
  if (options.activeTab === 'edit') {
    return { previousDisabled: true, stepDisabled: true }
  }

  if (options.activeTab === 'generate') {
    return {
      previousDisabled: options.generating || options.generationStepIndex === 0,
      stepDisabled: options.generating,
    }
  }

  return {
    previousDisabled: options.running || options.solveStepIndex === 0,
    stepDisabled: options.running,
  }
}

export function getSolveRunAction(
  running: boolean,
  status: SolveState['status'],
): SolveRunAction {
  if (running) {
    return 'pause'
  }

  return status === 'running' ? 'start' : 'restart'
}

export function getSolveStepAction(status: SolveState['status']): SolveStepAction {
  return status === 'running' ? 'step' : 'restart'
}

export interface SyncUiParams {
  activeTab: PanelTab
  generating: boolean
  generationDone: boolean
  generationPreviewAlgorithm: MazeGenerationAlgorithm
  generationStepIndex: number
  generationStepTotal: number
  getGenerationTrailKeysSize: () => number
  hasGenerationPreviewVisible: boolean
  hasGeneratedMaze: boolean
  exportSvgButton: HTMLButtonElement
  floodAlgorithm: boolean
  resetButton: HTMLButtonElement
  previousStepButton: HTMLButtonElement
  runButton: HTMLButtonElement
  running: boolean
  solveStepIndex: number
  /** True while an image shape fixes the grid dimensions. */
  shapeLocked: boolean
  solvingSelect: HTMLSelectElement
  speedLabel: HTMLElement
  statPath: HTMLElement
  statVisited: HTMLElement
  statusText: HTMLElement
  stepBatchSize: number
  stepButton: HTMLButtonElement
  stepDelay: number
  stepState: SolveState
  styleEditingVisibility: () => void
  useViewportRatio: boolean
  visitedGenerationCount: number
  generationTotalCells: number
  wallLabel: HTMLElement
  wallThickness: number
  widthInput: HTMLInputElement
  heightInput: HTMLInputElement
  lockRatioInput: HTMLInputElement
  viewportRatioInput: HTMLInputElement
}

export function syncUiState(params: SyncUiParams): void {
  const stepButtons = getStepButtonState(params)
  const generationStatus = getGenerationPlaybackStatus({
    generating: params.generating,
    generationDone: params.generationDone,
    hasGeneratedMaze: params.hasGeneratedMaze,
    hasGenerationPreview: params.hasGenerationPreviewVisible,
  })
  params.styleEditingVisibility()
  params.speedLabel.textContent = `${params.stepDelay} ms / step`
  params.wallLabel.textContent = `${params.wallThickness.toFixed(1)} px`
  params.exportSvgButton.disabled = params.generating || params.running

  if (params.activeTab === 'generate') {
    if (params.generating && params.generationTotalCells > 0) {
      const percentage = clamp(
        Math.round((params.visitedGenerationCount / params.generationTotalCells) * 100),
        0,
        100,
      )
      params.statusText.classList.add('is-progress')
      const percentageText = document.createElement('span')
      percentageText.className = 'status-percent'
      percentageText.textContent = `${percentage}%`
      params.statusText.replaceChildren('generating', percentageText)
    }
    else {
      params.statusText.classList.remove('is-progress')
      params.statusText.textContent = generationStatus
    }

    params.statVisited.textContent = params.hasGenerationPreviewVisible ? String(params.visitedGenerationCount) : '0'
    if (params.hasGenerationPreviewVisible && params.generationPreviewAlgorithm === 'kruskal') {
      params.statPath.textContent = String(params.generationStepIndex)
    }
    else {
      params.statPath.textContent = params.hasGenerationPreviewVisible ? String(params.getGenerationTrailKeysSize()) : '0'
    }

    params.runButton.classList.toggle('is-running', params.generating)
    params.runButton.disabled = false
    params.previousStepButton.disabled = stepButtons.previousDisabled
    params.stepButton.disabled = stepButtons.stepDisabled
    params.resetButton.disabled = false

    params.widthInput.disabled = params.generating || params.shapeLocked
    params.heightInput.disabled = params.generating || params.useViewportRatio || params.shapeLocked
    params.lockRatioInput.disabled = params.generating || params.useViewportRatio || params.shapeLocked
    params.viewportRatioInput.disabled = params.generating || params.shapeLocked
    params.solvingSelect.disabled = params.running
    return
  }

  if (params.activeTab === 'edit') {
    params.statusText.classList.remove('is-progress')
    params.statusText.textContent = 'editing'
    params.statVisited.textContent = '0'
    params.statPath.textContent = '0'
    params.runButton.classList.toggle('is-running', false)
    params.runButton.disabled = true
    params.previousStepButton.disabled = stepButtons.previousDisabled
    params.stepButton.disabled = stepButtons.stepDisabled
    params.resetButton.disabled = false
    params.widthInput.disabled = params.shapeLocked
    params.heightInput.disabled = params.useViewportRatio || params.shapeLocked
    params.lockRatioInput.disabled = params.useViewportRatio || params.shapeLocked
    params.viewportRatioInput.disabled = params.shapeLocked
    params.solvingSelect.disabled = false
    return
  }

  params.statusText.classList.remove('is-progress')
  const solveInitial = params.stepState.status === 'running'
    && params.stepState.visitedCount === 0
    && params.stepState.path.length === 0
    && params.stepState.frontierSize === 0
  params.statusText.textContent = params.running
    ? (params.floodAlgorithm ? 'flooding' : 'solving')
    : (solveInitial ? 'idle' : (params.floodAlgorithm ? 'complete' : params.stepState.status))

  params.statVisited.textContent = String(params.stepState.visitedCount)
  params.statPath.textContent = String(params.stepState.path.length)

  params.runButton.classList.toggle('is-running', params.running)
  params.runButton.disabled = false
  params.previousStepButton.disabled = stepButtons.previousDisabled
  params.stepButton.disabled = stepButtons.stepDisabled
  params.resetButton.disabled = false

  params.widthInput.disabled = params.generating || params.shapeLocked
  params.heightInput.disabled = params.generating || params.useViewportRatio || params.shapeLocked
  params.lockRatioInput.disabled = params.generating || params.useViewportRatio || params.shapeLocked
  params.viewportRatioInput.disabled = params.generating || params.shapeLocked
  params.solvingSelect.disabled = params.running
}
