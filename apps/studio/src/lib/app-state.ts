import type { Maze, MazeSolvingStep, StepPlayer } from 'mazely'
import type { GenerationPreview } from './controllers/generation'
import type { AppliedShape, ShapeEditorApi } from './controllers/shape-editor'
import type { FloodTheme } from './flood'
import type {
  MazeGenerationAlgorithm,
  MazePoint,
  MazeSolvingAlgorithm,
  MazeViewState,
} from './maze-types'
import type { SolveState } from './solver-state'
import type { ThreeMazeView } from './three-view'
import type { MazeEditTarget, MazeEditTool, PanelTab, StyleTheme, StyleVisibility } from './types'
import type { Webgl2dMazeView } from './webgl-2d-view'
import { createMaze } from 'mazely'
import { getGenerationAlgorithm, getSolvingAlgorithm } from './algorithms'
import {
  lockGridRatioInput,
  mazeHeightInput,
  mazeWidthInput,
  useViewportRatioInput,
  wallHeightRange,
  wallRange,
} from './dom'
import { DEFAULT_FLOOD_THEME } from './flood'
import { key } from './point'
import { DEFAULT_STYLE_THEME, DEFAULT_STYLE_VISIBILITY } from './types'
import { parseGridDimension, parseRange } from './utils'

export interface AppState {
  activeTab: PanelTab
  mazeWidth: number
  mazeHeight: number
  hasValidGridDimensions: boolean
  lockGridRatio: boolean
  useViewportRatio: boolean
  lockedGridRatio: number
  stepDelay: number
  stepBatchSize: number
  wallThickness: number
  view3d: boolean
  wallHeightPx: number
  threeView: ThreeMazeView | null
  threeViewPromise: Promise<ThreeMazeView> | null
  webgl2dView: Webgl2dMazeView | null
  webgl2dViewPromise: Promise<Webgl2dMazeView> | null
  styleTheme: StyleTheme
  visibleElements: StyleVisibility
  solveRuntime: Maze | null
  solvePlayer: StepPlayer<MazeSolvingStep> | null
  floodDepthByKey: Record<string, number>
  floodTheme: FloodTheme
  shape: AppliedShape | null
  shapeEditor: ShapeEditorApi | null
  showShapeColors: boolean
  mazeRuntime: Maze | null
  maze: MazeViewState
  stepState: SolveState
  hasGeneratedMaze: boolean
  hasCustomStartAndEndPoints: boolean
  mazeEditVersion: number
  editTool: MazeEditTool
  editingMaze: boolean
  editPointerId: number | null
  editLastTargetKey: string | null
  editHoverTarget: MazeEditTarget | null
  running: boolean
  openPanel: 'workbench' | 'themes' | null
  solveAnimationFrame: number
  solveLastTimestamp: number
  solveElapsed: number
  generating: boolean
  generationFrame: number
  generationLastTimestamp: number
  generationElapsed: number
  generationPreview: GenerationPreview | null
  zoom: number
  panX: number
  panY: number
  dragging: boolean
  activePointerId: number | null
  lastPointerX: number
  lastPointerY: number
  solveCurrentHeadKey: string | null
  solveCacheVersion: number
  cachedPathSource: MazePoint[] | null
  cachedPathSet: Set<string>
  cachedParentByKeyVersion: number
  cachedParentByKey: Record<string, string | null>
  generationCacheVersion: number
  cachedGenerationFrontierVersion: number
  cachedGenerationFrontierHeads: MazePoint[]
  cachedGenerationFrontierTrailEdgesVersion: number
  cachedGenerationFrontierTrailEdges: Set<string>
  pointKeyBuffer: string[][]
  pointKeyRows: number
  pointKeyCols: number
  generationDiscoveredMask: Uint8Array
  generationMaskCols: number
  generationMaskRows: number
}

// Filled by initAppState() before any listener can run; the cast lets the
// object exist as a stable import binding without nullable field access.
export const app: AppState = {} as AppState

export function createMazeViewState(
  width: number,
  height: number,
  algorithm: MazeGenerationAlgorithm,
  start: MazePoint,
  end: MazePoint,
): MazeViewState {
  return {
    algorithm,
    cols: width,
    end,
    rows: height,
    start,
  }
}

export function createInitialSolveState(
  algorithm: MazeSolvingAlgorithm,
  start: MazePoint,
  end: MazePoint,
): SolveState {
  return {
    algorithm,
    cameFrom: {},
    end,
    frontier: new Set<string>(),
    frontierSize: 0,
    path: [],
    start,
    status: 'running',
    visited: {},
    visitedCount: 0,
  }
}

/** Solid (unopened) maze grid honoring the applied shape, if any. */
export function createSolidMazeState(
  width: number,
  height: number,
  algorithm: MazeGenerationAlgorithm,
  shape: AppliedShape | null,
): { maze: MazeViewState, runtime: Maze } {
  const runtime = createMaze({
    grid: { cols: width, mask: shape?.cellMask ?? undefined, rows: height, type: 'square' },
  })
  const start = shape?.start ?? { x: 0, y: 0 }
  const end = shape?.end ?? { x: width - 1, y: height - 1 }
  return {
    maze: createMazeViewState(width, height, algorithm, start, end),
    runtime,
  }
}

/** Must run after the algorithm selects are set to their defaults. */
export function initAppState(options: {
  generationAlgorithmValue: string
  solvingAlgorithmValue: string
}): void {
  const mazeWidth = parseGridDimension(mazeWidthInput.value, 20)
  const mazeHeight = parseGridDimension(mazeHeightInput.value, 20)
  const initialMazeState = createSolidMazeState(
    mazeWidth,
    mazeHeight,
    getGenerationAlgorithm(options.generationAlgorithmValue),
    null,
  )
  const stepState = createInitialSolveState(
    getSolvingAlgorithm(options.solvingAlgorithmValue),
    initialMazeState.maze.start,
    initialMazeState.maze.end,
  )

  Object.assign<AppState, AppState>(app, {
    activePointerId: null,
    activeTab: 'generate',
    cachedGenerationFrontierHeads: [],
    cachedGenerationFrontierTrailEdges: new Set<string>(),
    cachedGenerationFrontierTrailEdgesVersion: -1,
    cachedGenerationFrontierVersion: -1,
    cachedParentByKey: {},
    cachedParentByKeyVersion: -1,
    cachedPathSet: new Set<string>(),
    cachedPathSource: null,
    dragging: false,
    editingMaze: false,
    editHoverTarget: null,
    editLastTargetKey: null,
    editPointerId: null,
    editTool: 'pan',
    floodDepthByKey: {},
    floodTheme: DEFAULT_FLOOD_THEME,
    generating: false,
    generationCacheVersion: 0,
    generationDiscoveredMask: new Uint8Array(0),
    generationElapsed: 0,
    generationFrame: 0,
    generationLastTimestamp: 0,
    generationMaskCols: 0,
    generationMaskRows: 0,
    generationPreview: null,
    hasCustomStartAndEndPoints: false,
    hasGeneratedMaze: false,
    hasValidGridDimensions: true,
    lastPointerX: 0,
    lastPointerY: 0,
    lockedGridRatio: mazeWidth / mazeHeight,
    lockGridRatio: lockGridRatioInput.checked,
    maze: initialMazeState.maze,
    mazeEditVersion: 0,
    mazeHeight,
    mazeRuntime: initialMazeState.runtime,
    mazeWidth,
    openPanel: window.matchMedia('(max-width: 767px)').matches ? null : 'workbench',
    panX: 0,
    panY: 0,
    pointKeyBuffer: [],
    pointKeyCols: 0,
    pointKeyRows: 0,
    running: false,
    shape: null,
    shapeEditor: null,
    visibleElements: { ...DEFAULT_STYLE_VISIBILITY },
    showShapeColors: true,
    solveAnimationFrame: 0,
    solveCacheVersion: 0,
    solveCurrentHeadKey: key(stepState.start.x, stepState.start.y),
    solveElapsed: 0,
    solveLastTimestamp: 0,
    solvePlayer: null,
    solveRuntime: null,
    stepBatchSize: 1,
    stepDelay: 20,
    stepState,
    styleTheme: { ...DEFAULT_STYLE_THEME },
    threeView: null,
    threeViewPromise: null,
    useViewportRatio: useViewportRatioInput.checked,
    view3d: false,
    wallHeightPx: parseRange(wallHeightRange.value, 14),
    wallThickness: parseRange(wallRange.value, 2),
    webgl2dView: null,
    webgl2dViewPromise: null,
    zoom: 1,
  })
}
