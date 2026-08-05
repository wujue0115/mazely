import type { CellId, MazeContext, MazePatch, MazePoint, MazeSolvingStep, SquareCell } from '../types'
import { getLinkedNeighbors } from '../graph'
import { pointToCellId } from '../types'

export function getSolveStartAndEndCells(
  context: MazeContext<SquareCell>,
  start: MazePoint,
  end: MazePoint,
) {
  const startCell = context.grid.getCell(pointToCellId(start))
  const endCell = context.grid.getCell(pointToCellId(end))
  return { endCell, startCell }
}

export function buildVisitStartStep(startCell: SquareCell): MazeSolvingStep {
  return {
    type: 'solve.visit',
    patches: [
      { type: 'setCellMeta', cellId: startCell.id, key: 'solve.visited', from: undefined, to: true },
    ],
    payload: { to: startCell.id },
  }
}

interface ExpandStepOptions {
  prevVisited?: unknown
  prevParent?: CellId
  extraPatches?: MazePatch[]
}

interface ProcessAddition {
  cell: SquareCell
  options?: ExpandStepOptions
}

/** Selects a frontier cell and applies all discoveries made while expanding it. */
export function buildProcessStep(
  current: SquareCell,
  additions: ProcessAddition[],
): MazeSolvingStep {
  return {
    type: 'solve.process',
    patches: additions.flatMap(({ cell, options }) =>
      buildExpandPatches(current, cell, options)),
    payload: {
      added: additions.map(({ cell }) => cell.id),
      current: current.id,
    },
  }
}

export function buildExpandStep(
  current: SquareCell,
  next: SquareCell,
  options: ExpandStepOptions = {},
): MazeSolvingStep {
  return {
    type: 'solve.expand',
    patches: buildExpandPatches(current, next, options),
    payload: { from: current.id, to: next.id },
  }
}

function buildExpandPatches(
  current: SquareCell,
  next: SquareCell,
  options: ExpandStepOptions = {},
): MazePatch[] {
  return [
    { type: 'setCellMeta', cellId: next.id, key: 'solve.visited', from: options.prevVisited, to: true },
    { type: 'setCellMeta', cellId: next.id, key: 'solve.parentId', from: options.prevParent, to: current.id },
    ...(options.extraPatches ?? []),
  ]
}

export function getOpenNeighbors(context: MazeContext<SquareCell>, current: SquareCell): SquareCell[] {
  return getLinkedNeighbors(context.grid, current)
}
