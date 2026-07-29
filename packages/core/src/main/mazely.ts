import type {
  CreateMazeOptions,
  MazeAlgorithm,
  MazeContext,
  MazeEdge,
  MazeEditor,
  MazeGenerationAlgorithm,
  MazeGenerationStep,
  MazeGrid,
  MazelyEventHandler,
  MazelyEventName,
  MazelyFloodOptions,
  MazelyGenerateOptions,
  MazelyPhase,
  MazelySolveOptions,
  MazelyState,
  MazePoint,
  MazeSolvingAlgorithm,
  MazeSolvingStep,
  MazeStep,
  SolveMazeResult,
  SquareCell,
} from '../types'
import { StepPlayer } from '../engine'
import {
  assertGridConnected,
  createAldousBroderAlgorithm,
  createBinaryTreeAlgorithm,
  createDfsAlgorithm,
  createEllerAlgorithm,
  createGrowingTreeAlgorithm,
  createHuntAndKillAlgorithm,
  createKruskalAlgorithm,
  createPrimAlgorithm,
  createRecursiveDivisionAlgorithm,
  createSidewinderAlgorithm,
  createTraversalAlgorithm,
  createWilsonAlgorithm,
  withSpanningTreeGuarantee,
} from '../generation'
import { createSquareGrid } from '../grid'
import {
  createSolveAStarAlgorithm,
  createSolveBestFirstAlgorithm,
  createSolveBfsAlgorithm,
  createSolveDfsAlgorithm,
  createSolveFloodAlgorithm,
  readSolveResult,
} from '../solving'
import { pointToCellId } from '../types'
import { createRandom } from '../utils'

export class Mazely {
  readonly grid: MazeGrid<SquareCell>

  private readonly seed?: string | number
  private phase: MazelyPhase = 'idle'
  private generationAlgorithm: MazeGenerationAlgorithm | undefined
  private solvingAlgorithm: MazeSolvingAlgorithm | undefined
  private solveEndPoint: MazePoint | undefined
  private player: StepPlayer<MazeGenerationStep> | StepPlayer<MazeSolvingStep> | null = null

  private readonly listeners: Record<MazelyEventName, Set<MazelyEventHandler>> = {
    complete: new Set(),
    edit: new Set(),
    phaseChange: new Set(),
    reset: new Set(),
    step: new Set(),
  }

  constructor(options: CreateMazeOptions) {
    const { grid: gridOptions } = options
    if (gridOptions.type !== 'square') {
      throw new Error(`Unsupported grid type: ${gridOptions.type}`)
    }
    this.seed = options.seed
    this.grid = createSquareGrid(gridOptions.rows, gridOptions.cols, gridOptions.mask)
  }

  generate(
    algorithm: MazeGenerationAlgorithm,
    options?: MazelyGenerateOptions,
  ): StepPlayer<MazeGenerationStep> {
    if (options?.start) {
      this.assertPointInGrid(options.start, 'start')
    }
    assertGridConnected(this.grid)

    this.prepareGridForGeneration(algorithm)
    this.generationAlgorithm = algorithm
    this.solvingAlgorithm = undefined
    this.solveEndPoint = undefined
    this.setPhase('generate')

    const selected = withSpanningTreeGuarantee(
      pickGenerationAlgorithm(algorithm, options?.start),
    )
    const player = this.createPlayer(selected)
    this.player = player
    return player
  }

  solve(algorithm: 'flood', options: MazelyFloodOptions): StepPlayer<MazeSolvingStep>
  solve(
    algorithm: Exclude<MazeSolvingAlgorithm, 'flood'>,
    options: MazelySolveOptions,
  ): StepPlayer<MazeSolvingStep>
  solve(
    algorithm: MazeSolvingAlgorithm,
    options: MazelyFloodOptions | MazelySolveOptions,
  ): StepPlayer<MazeSolvingStep> {
    if (this.phase === 'generate' && this.player && !this.player.done) {
      throw new Error(
        'Cannot solve while generation is unfinished. Call finish() on the generation player first.',
      )
    }
    this.assertPointInGrid(options.start, 'start')
    if (algorithm !== 'flood' && !options.end) {
      throw new TypeError(`Solving algorithm "${algorithm}" requires an end point.`)
    }
    if (options.end) {
      this.assertPointInGrid(options.end, 'end')
    }

    this.clearSolveMeta()
    this.solvingAlgorithm = algorithm
    this.solveEndPoint = options.end
    this.setPhase('solve')

    const selected = pickSolvingAlgorithm(algorithm, options.start, options.end)
    const player = this.createPlayer(selected)
    this.player = player
    return player
  }

  next(count = 1): boolean {
    return this.ensurePlayer().next(count)
  }

  prev(count = 1): boolean {
    return this.ensurePlayer().prev(count)
  }

  reset(): void {
    this.ensurePlayer().reset()
  }

  edit(callback: (editor: MazeEditor) => void): void {
    this.assertCanEdit()
    const changes = new Map<MazeEdge, boolean>()
    callback(this.createEditor(changes))
    for (const [edge, opened] of changes) {
      this.setEdgeOpenedDirect(edge, opened)
    }
    this.finishManualEdit()
  }

  setEdgeOpened(edgeId: string, opened: boolean): void {
    this.edit(editor => editor.setEdgeOpened(edgeId, opened))
  }

  setEdgeOpenedBetween(from: MazePoint, to: MazePoint, opened: boolean): void {
    this.edit(editor => editor.setEdgeOpenedBetween(from, to, opened))
  }

  openCell(point: MazePoint): void {
    this.edit(editor => editor.openCell(point))
  }

  closeCell(point: MazePoint): void {
    this.edit(editor => editor.closeCell(point))
  }

  openAllEdges(): void {
    this.edit(editor => editor.openAllEdges())
  }

  closeAllEdges(): void {
    this.edit(editor => editor.closeAllEdges())
  }

  clearSolveState(): void {
    this.assertCanEdit()
    this.clearSolveMeta()
    this.player = null
    this.solvingAlgorithm = undefined
    this.solveEndPoint = undefined
    if (this.phase === 'solve') {
      this.setPhase('idle')
    }
    this.emit('edit')
  }

  getState(): MazelyState {
    return {
      done: this.player?.done ?? false,
      generationAlgorithm: this.generationAlgorithm,
      index: this.player?.index ?? 0,
      phase: this.phase,
      solvingAlgorithm: this.solvingAlgorithm,
      totalSteps: this.player?.total ?? 0,
    }
  }

  getSolveResult(): SolveMazeResult | undefined {
    if (!this.solvingAlgorithm) {
      return undefined
    }
    if (this.solvingAlgorithm === 'flood') {
      return {
        algorithm: this.solvingAlgorithm,
        path: [],
        solved: this.player?.done ?? false,
        visitedCount: this.grid.cells
          .filter(cell => Boolean(cell.getMeta('solve.visited')))
          .length,
      }
    }
    if (!this.solveEndPoint) {
      return undefined
    }
    return readSolveResult({
      algorithm: this.solvingAlgorithm,
      end: this.solveEndPoint,
      grid: this.grid,
    })
  }

  on(event: MazelyEventName, handler: MazelyEventHandler): () => void {
    this.listeners[event].add(handler)
    return () => this.off(event, handler)
  }

  off(event: MazelyEventName, handler: MazelyEventHandler): void {
    this.listeners[event].delete(handler)
  }

  private createPlayer<Step extends MazeStep>(
    algorithm: MazeAlgorithm<SquareCell, Step>,
  ): StepPlayer<Step> {
    const random = createRandom(this.seed)
    const context: MazeContext<SquareCell> = { grid: this.grid, random }
    return new StepPlayer({
      grid: this.grid,
      steps: algorithm.generate(context),
      onEvent: event => this.emit(event),
    })
  }

  private emit(event: MazelyEventName): void {
    const payload = { state: this.getState() }
    for (const callback of this.listeners[event]) {
      callback(payload)
    }
  }

  private setPhase(next: MazelyPhase): void {
    if (this.phase === next)
      return
    this.phase = next
    this.emit('phaseChange')
  }

  private createEditor(changes: Map<MazeEdge, boolean>): MazeEditor {
    const stageEdge = (edge: MazeEdge, opened: boolean): void => {
      changes.set(edge, opened)
    }
    const stageCell = (point: MazePoint, opened: boolean): void => {
      const cell = this.getSquareCell(point, 'cell')
      for (const edge of cell.getEdges()) {
        stageEdge(edge, opened)
      }
    }

    return {
      closeAllEdges: () => {
        for (const edge of this.grid.edges) {
          stageEdge(edge, false)
        }
      },
      closeCell: point => stageCell(point, false),
      openAllEdges: () => {
        for (const edge of this.grid.edges) {
          stageEdge(edge, true)
        }
      },
      openCell: point => stageCell(point, true),
      setEdgeOpened: (edgeId, opened) => stageEdge(this.getEdgeById(edgeId), opened),
      setEdgeOpenedBetween: (from, to, opened) => {
        stageEdge(this.getEdgeBetween(from, to), opened)
      },
    }
  }

  private finishManualEdit(): void {
    this.clearSolveMeta()
    this.player = null
    this.generationAlgorithm = undefined
    this.solvingAlgorithm = undefined
    this.solveEndPoint = undefined
    this.setPhase('idle')
    this.emit('edit')
  }

  private prepareGridForGeneration(algorithm: MazeGenerationAlgorithm): void {
    for (const cell of this.grid.cells) {
      cell.meta.clear()
    }
    for (const edge of this.grid.edges) {
      if (algorithm === 'recursive-division') {
        edge.open()
      }
      else {
        edge.close()
      }
    }
  }

  private clearSolveMeta(): void {
    for (const cell of this.grid.cells) {
      for (const key of [...cell.meta.keys()]) {
        if (key.startsWith('solve.')) {
          cell.meta.delete(key)
        }
      }
    }
  }

  private ensurePlayer(): StepPlayer<MazeGenerationStep> | StepPlayer<MazeSolvingStep> {
    if (!this.player) {
      throw new Error('No active phase. Call generate() or solve() first.')
    }
    return this.player
  }

  private assertCanEdit(): void {
    if (this.player && this.player.index > 0 && !this.player.done) {
      throw new Error(
        'Cannot edit while playback is unfinished. Finish or reset the active player first.',
      )
    }
  }

  private getEdgeById(edgeId: string): MazeEdge {
    const edge = this.grid.edges.find(edge => edge.id === edgeId)
    if (!edge) {
      throw new RangeError(`edge "${edgeId}" does not exist.`)
    }
    return edge
  }

  private getEdgeBetween(from: MazePoint, to: MazePoint): MazeEdge {
    const distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y)
    if (distance !== 1) {
      throw new RangeError(
        `Cells (${from.x}, ${from.y}) and (${to.x}, ${to.y}) are not adjacent.`,
      )
    }

    const fromCell = this.getSquareCell(from, 'from')
    const toCell = this.getSquareCell(to, 'to')
    const edge = fromCell.getEdges().find(edge => edge.getOther(fromCell)?.id === toCell.id)
    if (!edge) {
      throw new RangeError(
        `No edge exists between (${from.x}, ${from.y}) and (${to.x}, ${to.y}).`,
      )
    }
    return edge
  }

  private getSquareCell(point: MazePoint, label: string): SquareCell {
    const cell = this.grid.getCell(pointToCellId(point))
    if (!cell) {
      throw new RangeError(
        `${label} (${point.x}, ${point.y}) is outside the ${this.grid.cols}x${this.grid.rows} grid.`,
      )
    }
    return cell
  }

  private setEdgeOpenedDirect(edge: MazeEdge, opened: boolean): void {
    if (opened) {
      edge.open()
    }
    else {
      edge.close()
    }
  }

  private assertPointInGrid(point: MazePoint, label: string): void {
    if (!this.grid.getCell(pointToCellId(point))) {
      throw new RangeError(
        `${label} (${point.x}, ${point.y}) is outside the ${this.grid.cols}x${this.grid.rows} grid.`,
      )
    }
  }
}

function pickGenerationAlgorithm(algorithm: MazeGenerationAlgorithm, start?: MazePoint) {
  if (algorithm === 'aldous-broder')
    return createAldousBroderAlgorithm()
  if (algorithm === 'binary-tree')
    return createBinaryTreeAlgorithm()
  if (algorithm === 'kruskal')
    return createKruskalAlgorithm()
  if (algorithm === 'eller')
    return createEllerAlgorithm()
  if (algorithm === 'growing-tree')
    return createGrowingTreeAlgorithm('newest', start)
  if (algorithm === 'hunt-and-kill')
    return createHuntAndKillAlgorithm(start)
  if (algorithm === 'prim')
    return createPrimAlgorithm(start)
  if (algorithm === 'recursive-division')
    return createRecursiveDivisionAlgorithm()
  if (algorithm === 'sidewinder')
    return createSidewinderAlgorithm()
  if (algorithm === 'traversal')
    return createTraversalAlgorithm(start)
  if (algorithm === 'wilson')
    return createWilsonAlgorithm()
  return createDfsAlgorithm(start)
}

function pickSolvingAlgorithm(
  algorithm: MazeSolvingAlgorithm,
  start: MazePoint,
  end?: MazePoint,
) {
  if (algorithm === 'flood')
    return createSolveFloodAlgorithm(start)
  if (!end)
    throw new TypeError(`Solving algorithm "${algorithm}" requires an end point.`)
  if (algorithm === 'bfs')
    return createSolveBfsAlgorithm(start, end)
  if (algorithm === 'best-first')
    return createSolveBestFirstAlgorithm(start, end)
  if (algorithm === 'a-star')
    return createSolveAStarAlgorithm(start, end)
  return createSolveDfsAlgorithm(start, end)
}
