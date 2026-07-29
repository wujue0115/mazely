import type { MazeCell, MazeEdge, MazePatch, MazeStep } from '../types'

export type StepPlayerEvent = 'step' | 'complete' | 'reset'

export interface StepPlayerProgress {
  bufferedSteps: number
  done: boolean
  index: number
  totalSteps: number | null
}

export interface StepPlayerEventPayload<Step extends MazeStep = MazeStep> {
  event: StepPlayerEvent
  progress: StepPlayerProgress
  step?: Step
}

export interface StepPlayerOptions<Step extends MazeStep = MazeStep> {
  grid: { cells: MazeCell[], edges: MazeEdge[] }
  steps: IterableIterator<Step> | Step[]
  onEvent?: (event: StepPlayerEvent, payload: StepPlayerEventPayload<Step>) => void
}

/**
 * Replays a list of maze steps against a grid. Steps only carry forward
 * patches; undoing applies the same patches in reverse order using their
 * `from` values.
 */
export class StepPlayer<Step extends MazeStep = MazeStep> {
  readonly steps: Step[]

  private cursor = 0
  private sourceDone = false
  private readonly source?: IterableIterator<Step>
  private readonly cellsById = new Map<string, MazeCell>()
  private readonly edgesById = new Map<string, MazeEdge>()
  private readonly onEvent?: (
    event: StepPlayerEvent,
    payload: StepPlayerEventPayload<Step>,
  ) => void

  constructor(options: StepPlayerOptions<Step>) {
    this.steps = Array.isArray(options.steps) ? options.steps : []
    this.source = Array.isArray(options.steps) ? undefined : options.steps
    this.sourceDone = Array.isArray(options.steps)
    this.onEvent = options.onEvent

    for (const cell of options.grid.cells) {
      this.cellsById.set(cell.id, cell)
    }
    for (const edge of options.grid.edges) {
      this.edgesById.set(edge.id, edge)
    }
  }

  get index(): number {
    return this.cursor
  }

  get total(): number {
    return this.steps.length
  }

  get progress(): StepPlayerProgress {
    const done = this.done
    return {
      bufferedSteps: this.steps.length,
      done,
      index: this.cursor,
      totalSteps: done ? this.steps.length : null,
    }
  }

  get done(): boolean {
    return !this.ensureStep(this.cursor)
  }

  /** Returns the most recently applied step, if any. */
  get lastStep(): Step | undefined {
    return this.steps[this.cursor - 1]
  }

  next(count = 1): boolean {
    const wasDone = this.done
    let progressed = false

    for (let i = 0; i < count; i += 1) {
      const step = this.getStep(this.cursor)
      if (!step)
        break
      this.applyStep(step, false)
      this.cursor += 1
      progressed = true
    }

    if (progressed) {
      this.emit('step')
      if (!wasDone && this.done) {
        this.emit('complete')
      }
    }
    return progressed
  }

  prev(count = 1): boolean {
    let progressed = false

    for (let i = 0; i < count; i += 1) {
      if (this.cursor <= 0)
        break
      const step = this.steps[this.cursor - 1]
      this.applyStep(step, true)
      this.cursor -= 1
      progressed = true
    }

    if (progressed) {
      this.emit('step')
    }
    return progressed
  }

  /** Applies all remaining steps. */
  finish(): boolean {
    let progressed = false
    while (this.next()) {
      progressed = true
    }
    return progressed
  }

  /** Rewinds all applied steps back to the initial state. */
  reset(): void {
    while (this.cursor > 0) {
      const step = this.steps[this.cursor - 1]
      this.applyStep(step, true)
      this.cursor -= 1
    }
    this.emit('reset')
  }

  private applyStep(step: Step, reverse: boolean): void {
    if (reverse) {
      for (let i = step.patches.length - 1; i >= 0; i -= 1) {
        this.applyPatch(step.patches[i], true)
      }
      return
    }

    for (const patch of step.patches) {
      this.applyPatch(patch, false)
    }
  }

  private getStep(index: number): Step | undefined {
    return this.ensureStep(index) ? this.steps[index] : undefined
  }

  private ensureStep(index: number): boolean {
    while (!this.sourceDone && this.steps.length <= index) {
      const next = this.source?.next()
      if (!next || next.done) {
        this.sourceDone = true
        break
      }
      this.steps.push(next.value)
    }

    return index < this.steps.length
  }

  private applyPatch(patch: MazePatch, reverse: boolean): void {
    if (patch.type === 'setCellMeta') {
      const cell = this.cellsById.get(patch.cellId)
      if (!cell)
        return
      const value = reverse ? patch.from : patch.to
      if (value === undefined)
        cell.meta.delete(patch.key)
      else cell.setMeta(patch.key, value)
      return
    }

    const edge = this.edgesById.get(patch.edgeId)
    if (!edge)
      return
    const opened = reverse ? patch.from : patch.to
    if (opened)
      edge.open()
    else edge.close()
  }

  private emit(event: StepPlayerEvent): void {
    this.onEvent?.(event, {
      event,
      progress: this.progress,
      step: event === 'step' ? this.lastStep : undefined,
    })
  }
}
