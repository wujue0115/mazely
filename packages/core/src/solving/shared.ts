import type { CellId, GridCell, MazeContext, MazePatch, MazePoint, MazeSolvingStep } from '../types'
import { getLinkedNeighbors } from '../graph'
import { pointToCellId, TriangleCell } from '../types'

export function getSolveStartAndEndCells(
  context: MazeContext<GridCell>,
  start: MazePoint,
  end: MazePoint,
) {
  const startCell = context.grid.getCell(pointToCellId(start))
  const endCell = context.grid.getCell(pointToCellId(end))
  return { endCell, startCell }
}

export function buildVisitStartStep(startCell: GridCell): MazeSolvingStep {
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
  cell: GridCell
  options?: ExpandStepOptions
}

/** Selects a frontier cell and applies all discoveries made while expanding it. */
export function buildProcessStep(
  current: GridCell,
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
  current: GridCell,
  next: GridCell,
  options: ExpandStepOptions = {},
): MazeSolvingStep {
  return {
    type: 'solve.expand',
    patches: buildExpandPatches(current, next, options),
    payload: { from: current.id, to: next.id },
  }
}

function buildExpandPatches(
  current: GridCell,
  next: GridCell,
  options: ExpandStepOptions = {},
): MazePatch[] {
  return [
    { type: 'setCellMeta', cellId: next.id, key: 'solve.visited', from: options.prevVisited, to: true },
    { type: 'setCellMeta', cellId: next.id, key: 'solve.parentId', from: options.prevParent, to: current.id },
    ...(options.extraPatches ?? []),
  ]
}

export function getOpenNeighbors(context: MazeContext<GridCell>, current: GridCell): GridCell[] {
  return getLinkedNeighbors(context.grid, current)
}

export function estimateCellDistance(cell: GridCell, end: GridCell): number {
  if (cell instanceof TriangleCell && end instanceof TriangleCell) {
    const triangleHeight = Math.sqrt(3) / 2
    const center = triangleCenter(cell, triangleHeight)
    const endCenter = triangleCenter(end, triangleHeight)
    // Neighboring triangle centroids are 1/sqrt(3) world units apart.
    return Math.hypot(center.x - endCenter.x, center.y - endCenter.y) * Math.sqrt(3)
  }
  return Math.abs(cell.col - end.col) + Math.abs(cell.row - end.row)
}

function triangleCenter(cell: TriangleCell, height: number): { x: number, y: number } {
  return {
    x: cell.offsetX + cell.col / 2 + 0.5,
    y: cell.row * height
      + (cell.orientation === 'up' ? height * 2 / 3 : height / 3),
  }
}
