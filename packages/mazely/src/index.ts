import type {
  MazeEditor,
  MazeGenerationAlgorithm,
  MazeGenerationStep,
  MazeGrid,
  MazelyEventHandler,
  MazelyEventName,
  MazelyFloodOptions,
  MazelyGenerateOptions,
  MazelyGridOptions,
  MazelySolveOptions,
  MazelyState,
  MazePoint,
  MazeSolvingAlgorithm,
  MazeSolvingStep,
  SolveMazeResult,
  SquareCell,
  StepPlayer,
} from '@mazely/core'
import { Mazely as MazelyRuntime } from '@mazely/core'

export type {
  CellId,
  GrowingTreeStrategy,
  MazeAlgorithm,
  MazeCellTransitionPayload,
  MazeContext,
  MazeEdgeCollectionPayload,
  MazeEditor,
  MazeFloodPayload,
  MazeGenerationAlgorithm,
  MazeGenerationAlgorithmCapabilities,
  MazeGenerationStep,
  MazeGrid,
  MazeHuntScanPayload,
  MazelyEventHandler,
  MazelyEventName,
  MazelyEventPayload,
  MazelyFloodOptions,
  MazelyGenerateOptions,
  MazelyGridOptions,
  MazelyPhase,
  MazelySolveOptions,
  MazelyState,
  MazelyStep,
  MazePatch,
  MazePayloadStep,
  MazePoint,
  MazeSolvingAlgorithm,
  MazeSolvingAlgorithmCapabilities,
  MazeSolvingStep,
  MazeStep,
  MazeStepPayload,
  MazeTraversalOptions,
  MazeTraversalStrategy,
  MazeTraversalVisit,
  RandomLike,
  SerializedMaze,
  SolveMazeResult,
  SquareGridMask,
  StepPlayerEvent,
  StepPlayerEventPayload,
  StepPlayerOptions,
  StepPlayerProgress,
} from '@mazely/core'

export {
  applySerializedGrid,
  areCellsDirectlyLinked,
  assertGridConnected,
  cellIdToPoint,
  createAldousBroderAlgorithm,
  createBinaryTreeAlgorithm,
  createDfsAlgorithm,
  createEllerAlgorithm,
  createGrowingTreeAlgorithm,
  createHuntAndKillAlgorithm,
  createKruskalAlgorithm,
  createPrimAlgorithm,
  createRandom,
  createRecursiveDivisionAlgorithm,
  createSidewinderAlgorithm,
  createSolveAStarAlgorithm,
  createSolveBestFirstAlgorithm,
  createSolveBfsAlgorithm,
  createSolveDfsAlgorithm,
  createSolveFloodAlgorithm,
  createSquareGrid,
  createTraversalAlgorithm,
  createWilsonAlgorithm,
  getLinkedNeighbors,
  getReachableCellIds,
  isMazeGenerationAlgorithm,
  isMazeSolvingAlgorithm,
  MAZE_GENERATION_ALGORITHMS,
  MAZE_GENERATION_CAPABILITIES,
  MAZE_SOLVING_ALGORITHMS,
  MAZE_SOLVING_CAPABILITIES,
  MazeCell,
  MazeEdge,
  MAZELY_DEFAULTS,
  pointToCellId,
  PriorityQueue,
  readSolveResult,
  serializeGrid,
  SquareCell,
  StepPlayer,
  traverseGrid,
  withSpanningTreeGuarantee,
} from '@mazely/core'

export interface CreateMazeOptions {
  grid?: MazeGridOptions
  seed?: string | number
}

export type MazeEventHandler = MazelyEventHandler
export type MazeEventName = MazelyEventName
export type MazeGridOptions = MazelyGridOptions

export interface Maze {
  readonly grid: MazeGrid<SquareCell>

  generate: (
    algorithm: MazeGenerationAlgorithm,
    options?: MazelyGenerateOptions,
  ) => StepPlayer<MazeGenerationStep>
  solve: {
    (algorithm: 'flood', options: MazelyFloodOptions): StepPlayer<MazeSolvingStep>
    (
      algorithm: Exclude<MazeSolvingAlgorithm, 'flood'>,
      options: MazelySolveOptions,
    ): StepPlayer<MazeSolvingStep>
  }
  next: (count?: number) => boolean
  prev: (count?: number) => boolean
  reset: () => void
  edit: (callback: (editor: MazeEditor) => void) => void
  setEdgeOpened: (edgeId: string, opened: boolean) => void
  setEdgeOpenedBetween: (from: MazePoint, to: MazePoint, opened: boolean) => void
  openCell: (point: MazePoint) => void
  closeCell: (point: MazePoint) => void
  openAllEdges: () => void
  closeAllEdges: () => void
  clearSolveState: () => void
  getState: () => MazelyState
  getSolveResult: () => SolveMazeResult | undefined
  on: (event: MazeEventName, handler: MazeEventHandler) => () => void
  off: (event: MazeEventName, handler: MazeEventHandler) => void
}

export const DEFAULT_MAZE_SIZE = Object.freeze({
  cols: 21,
  rows: 21,
} as const)

/** Creates a maze through the stable public factory API. */
export function createMaze(options: CreateMazeOptions = {}): Maze {
  return new MazelyRuntime({
    grid: options.grid ?? {
      cols: DEFAULT_MAZE_SIZE.cols,
      rows: DEFAULT_MAZE_SIZE.rows,
      type: 'square',
    },
    seed: options.seed,
  })
}
