import type { MazeGenerationAlgorithm, MazeSolvingAlgorithm } from './algorithms'

export type { MazeGenerationAlgorithm, MazeSolvingAlgorithm } from './algorithms'

export type CellId = string

export interface MazePoint {
  x: number
  y: number
}

export function pointToCellId(point: MazePoint): CellId {
  return `${point.y}:${point.x}`
}

export function cellIdToPoint(id: CellId): MazePoint {
  const [yString, xString] = id.split(':')
  return { x: Number(xString), y: Number(yString) }
}

export interface RandomLike {
  next: () => number
  int: (min: number, max: number) => number
  pick: <Item>(items: Item[]) => Item
  shuffle: <Item>(items: Item[]) => Item[]
}

export abstract class MazeCell {
  readonly id: CellId
  readonly meta = new Map<string, unknown>()

  constructor(id: CellId) {
    this.id = id
  }

  abstract getEdges(): MazeEdge[]
  abstract getNeighbors(): MazeCell[]

  getMeta<Value = unknown>(key: string): Value | undefined {
    return this.meta.get(key) as Value | undefined
  }

  setMeta(key: string, value: unknown): void {
    this.meta.set(key, value)
  }
}

export class MazeEdge {
  readonly id: string
  readonly from: MazeCell
  readonly to: MazeCell | null

  private _opened: boolean

  constructor(options: {
    id: string
    from: MazeCell
    to: MazeCell | null
    opened?: boolean
  }) {
    this.id = options.id
    this.from = options.from
    this.to = options.to
    this._opened = options.opened ?? false
  }

  get opened(): boolean {
    return this._opened
  }

  open(): void {
    this._opened = true
  }

  close(): void {
    this._opened = false
  }

  getOther(cell: MazeCell): MazeCell | null {
    if (cell.id === this.from.id)
      return this.to
    if (cell.id === this.to?.id)
      return this.from
    return null
  }
}

export class SquareCell extends MazeCell {
  readonly row: number
  readonly col: number

  edges = {
    top: null as MazeEdge | null,
    right: null as MazeEdge | null,
    bottom: null as MazeEdge | null,
    left: null as MazeEdge | null,
  }

  constructor(options: { id: CellId, row: number, col: number }) {
    super(options.id)
    this.row = options.row
    this.col = options.col
  }

  getEdges(): MazeEdge[] {
    return Object.values(this.edges).filter(Boolean) as MazeEdge[]
  }

  getNeighbors(): MazeCell[] {
    return this.getEdges()
      .map(edge => edge.getOther(this))
      .filter(Boolean) as MazeCell[]
  }
}

export interface MazeGrid<Cell extends MazeCell = MazeCell> {
  readonly rows: number
  readonly cols: number
  readonly cells: Cell[]
  readonly edges: MazeEdge[]

  getCell: (id: CellId) => Cell | undefined
  getNeighbors: (cell: Cell) => Cell[]
  getEdges: (cell: Cell) => MazeEdge[]
}

export interface MazeContext<Cell extends MazeCell = MazeCell> {
  grid: MazeGrid<Cell>
  random: RandomLike
}

export type MazePatch
  = | {
    type: 'setCellMeta'
    cellId: CellId
    key: string
    from: unknown
    to: unknown
  }
  | {
    type: 'setEdgeOpened'
    edgeId: string
    from: boolean
    to: boolean
  }

export interface MazeStepPayload {
  from?: CellId | null
  to?: CellId
  [key: string]: unknown
}

export interface MazeStep<
  Type extends string = string,
  Payload extends MazeStepPayload = MazeStepPayload,
> {
  type: Type
  patches: MazePatch[]
  payload?: Payload
}

export interface MazeCellTransitionPayload extends MazeStepPayload {
  from?: CellId | null
  to: CellId
}

export interface MazeEdgeCollectionPayload extends MazeStepPayload {
  edges: string[]
}

export interface MazeHuntScanPayload extends MazeStepPayload {
  row: number
}

export interface MazeFloodPayload extends MazeCellTransitionPayload {
  depth: number
}

export interface MazeSolveProcessPayload extends MazeStepPayload {
  current: CellId
  added: CellId[]
}

export type MazePayloadStep<
  Type extends string,
  Payload extends MazeStepPayload,
> = MazeStep<Type, Payload> & { payload: Payload }

export type MazeGenerationStep
  = | MazePayloadStep<'carve', MazeCellTransitionPayload>
    | MazePayloadStep<'close' | 'open' | 'generation.normalize.close', MazeEdgeCollectionPayload>
    | MazePayloadStep<'hunt-scan', MazeHuntScanPayload>
    | MazePayloadStep<'visit', MazeCellTransitionPayload>

export type MazeSolvingStep
  = | MazePayloadStep<'solve.expand', MazeCellTransitionPayload>
    | MazePayloadStep<'solve.flood', MazeFloodPayload>
    | MazePayloadStep<'solve.process', MazeSolveProcessPayload>
    | MazePayloadStep<'solve.visit', MazeCellTransitionPayload>

export type MazelyStep = MazeGenerationStep | MazeSolvingStep

export interface MazeAlgorithm<
  Cell extends MazeCell = MazeCell,
  Step extends MazeStep = MazeStep,
> {
  name: string
  generate: (context: MazeContext<Cell>) => IterableIterator<Step>
}

export interface SolveMazeResult {
  algorithm: MazeSolvingAlgorithm
  solved: boolean
  path: MazePoint[]
  visitedCount: number
}

export type MazelyPhase = 'idle' | 'generate' | 'solve'

export interface MazelyGridOptions {
  type: 'square'
  rows: number
  cols: number
  /**
   * Optional cell inclusion mask indexed as `mask[row][col]`; `true` keeps
   * the cell. Excluded cells and their edges are absent from the grid, so
   * generation and solving stay inside the masked shape.
   */
  mask?: readonly (readonly boolean[])[]
}

export interface CreateMazeOptions {
  seed?: string | number
  grid: MazelyGridOptions
}

export interface MazelyGenerateOptions {
  start?: MazePoint
}

export interface MazelySolveOptions {
  start: MazePoint
  end: MazePoint
}

export interface MazelyFloodOptions {
  start: MazePoint
  end?: never
}

export interface MazeEditor {
  setEdgeOpened: (edgeId: string, opened: boolean) => void
  setEdgeOpenedBetween: (from: MazePoint, to: MazePoint, opened: boolean) => void
  openCell: (point: MazePoint) => void
  closeCell: (point: MazePoint) => void
  openAllEdges: () => void
  closeAllEdges: () => void
}

export interface MazelyState {
  phase: MazelyPhase
  index: number
  totalSteps: number
  done: boolean
  generationAlgorithm?: MazeGenerationAlgorithm
  solvingAlgorithm?: MazeSolvingAlgorithm
}

export type MazelyEventName = 'step' | 'complete' | 'reset' | 'phaseChange' | 'edit'

export interface MazelyEventPayload {
  state: MazelyState
}

export type MazelyEventHandler = (payload: MazelyEventPayload) => void
