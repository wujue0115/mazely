import type { MazeCell, MazeContext, MazeEdge, MazeGenerationStep, MazePoint, SquareCell } from '../types'
import { pointToCellId } from '../types'

export function resolveStartCell(
  context: MazeContext<SquareCell>,
  start?: MazePoint,
): SquareCell | undefined {
  if (start) {
    return context.grid.getCell(pointToCellId(start)) ?? context.grid.cells[0]
  }
  return context.grid.cells[0]
}

/**
 * A carve step opens one edge; `from`/`to` describe the expansion direction
 * (already-carved cell towards the newly reached cell).
 */
export function buildCarveStep(edge: MazeEdge, from: MazeCell, to: MazeCell): MazeGenerationStep {
  return {
    type: 'carve',
    patches: [{ type: 'setEdgeOpened', edgeId: edge.id, from: edge.opened, to: true }],
    payload: { from: from.id, to: to.id },
  }
}
