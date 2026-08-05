import type { MazeGenerationAlgorithm, MazeSolvingAlgorithm } from './maze-types'
import type { SolveState } from './solver-state'
import type { PanelTab } from './types'
import {
  isMazeGenerationAlgorithm,
  isMazeSolvingAlgorithm,
  MAZE_GENERATION_CAPABILITIES,
  MAZELY_DEFAULTS,
} from 'mazely'

export function getGenerationAlgorithm(value: string): MazeGenerationAlgorithm {
  return isMazeGenerationAlgorithm(value)
    ? value
    : MAZELY_DEFAULTS.generationAlgorithm
}

export function getSolvingAlgorithm(value: string): MazeSolvingAlgorithm {
  return isMazeSolvingAlgorithm(value)
    ? value
    : MAZELY_DEFAULTS.solvingAlgorithm
}

export function shouldUseRandomGenerationStart(algorithm: MazeGenerationAlgorithm): boolean {
  return MAZE_GENERATION_CAPABILITIES[algorithm].usesStart
}

export function isGenerationVisibleMultiHeadMode(algorithm: MazeGenerationAlgorithm): boolean {
  return algorithm === 'prim' || algorithm === 'traversal'
}

export function isSolveVisibleMultiHeadMode(algorithm: MazeSolvingAlgorithm): boolean {
  return algorithm === 'bfs' || algorithm === 'best-first' || algorithm === 'a-star'
}

export function shouldShowGenerationTrail(algorithm: MazeGenerationAlgorithm): boolean {
  return algorithm !== 'aldous-broder'
}

export function shouldShowFloodVisualization(options: {
  activeTab: PanelTab
  previewingGeneration: boolean
  solvingAlgorithm: MazeSolvingAlgorithm
  solveStarted: boolean
  solveStatus: SolveState['status']
}): boolean {
  if (options.solvingAlgorithm !== 'flood' || options.previewingGeneration) {
    return false
  }

  return options.activeTab === 'solve'
    || (options.activeTab === 'generate' && (
      options.solveStatus !== 'running' || options.solveStarted
    ))
}

export function shouldShowSolveProgress(options: {
  activeTab: PanelTab
  previewingGeneration: boolean
  solveStarted: boolean
  solveStatus: SolveState['status']
}): boolean {
  if (options.previewingGeneration || options.solveStatus !== 'running') {
    return false
  }

  return options.activeTab === 'solve'
    || (options.activeTab === 'generate' && options.solveStarted)
}

export function shouldShowGenerationStartMarker(
  previewingGeneration: boolean,
  algorithm: MazeGenerationAlgorithm,
): boolean {
  if (!previewingGeneration) {
    return false
  }

  return algorithm === 'dfs'
    || algorithm === 'growing-tree'
    || algorithm === 'hunt-and-kill'
    || algorithm === 'prim'
    || algorithm === 'traversal'
}

export function getPointMarkerVisibility(options: {
  activeTab: PanelTab
  floodActive: boolean
  floodStarted: boolean
  generationAlgorithm: MazeGenerationAlgorithm
  lowDetail?: boolean
  previewingGeneration: boolean
  showingSolveResult: boolean
  visibleEnd: boolean
  visibleStart: boolean
}): { end: boolean, start: boolean } {
  const lowDetail = options.lowDetail ?? false
  return {
    end: options.visibleEnd && !lowDetail && !options.floodActive && (
      options.activeTab === 'solve'
      || options.activeTab === 'edit'
      || options.showingSolveResult
    ),
    start: options.visibleStart && !lowDetail && !options.floodStarted && (
      options.activeTab === 'solve'
      || options.activeTab === 'edit'
      || options.showingSolveResult
      || shouldShowGenerationStartMarker(
        options.previewingGeneration,
        options.generationAlgorithm,
      )
    ),
  }
}
