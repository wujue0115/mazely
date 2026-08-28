import type { GridCell, MazeAlgorithm, MazeContext, MazeGenerationStep } from '../types'
import { buildPositionMap, cellAt, edgeBetween } from './grid-helpers'
import { buildCarveStep } from './shared'

class SidewinderAlgorithm implements MazeAlgorithm<GridCell, MazeGenerationStep> {
  name = 'sidewinder';

  * generate(context: MazeContext<GridCell>): IterableIterator<MazeGenerationStep> {
    if (context.grid.type === 'triangle') {
      yield* generateTriangle(context)
      return
    }

    const byPosition = buildPositionMap(context.grid.cells)

    for (let row = 0; row < context.grid.rows; row += 1) {
      let run: GridCell[] = []
      for (let col = 0; col < context.grid.cols; col += 1) {
        const cell = cellAt(byPosition, row, col)
        if (!cell) {
          run = []
          continue
        }

        run.push(cell)
        const east = cellAt(byPosition, row, col + 1)
        const north = cellAt(byPosition, row - 1, col)
        const mustCloseRun = !east
        const shouldCloseRun = mustCloseRun || (north && context.random.int(0, 1) === 0)

        if (shouldCloseRun) {
          const northCandidates = run.filter(runCell => cellAt(byPosition, runCell.row - 1, runCell.col))
          if (northCandidates.length > 0) {
            const linkFrom = context.random.pick(northCandidates)
            const linkTo = cellAt(byPosition, linkFrom.row - 1, linkFrom.col)!
            const edge = edgeBetween(linkFrom, linkTo)
            if (edge) {
              yield buildCarveStep(edge, linkFrom, linkTo)
            }
          }
          run = []
        }
        else if (east) {
          const edge = edgeBetween(cell, east)
          if (edge) {
            yield buildCarveStep(edge, cell, east)
          }
        }
      }
    }
  }
}

export function createSidewinderAlgorithm(): MazeAlgorithm<GridCell, MazeGenerationStep> {
  return new SidewinderAlgorithm()
}

function* generateTriangle(
  context: MazeContext<GridCell>,
): IterableIterator<MazeGenerationStep> {
  const rows = Array.from({ length: context.grid.rows }, () => [] as GridCell[])
  for (const cell of context.grid.cells) {
    rows[cell.row].push(cell)
  }
  rows.forEach(cells => cells.sort((a, b) => a.col - b.col))

  for (const rowCells of rows) {
    const previousByCell = new Map(
      rowCells.flatMap((cell) => {
        const previous = previousRowNeighbor(context, cell)
        return previous ? [[cell.id, previous] as const] : []
      }),
    )
    const hasPreviousAfter = previousCandidatesAfter(rowCells, previousByCell)
    let run: GridCell[] = []

    for (let index = 0; index < rowCells.length; index += 1) {
      const cell = rowCells[index]
      run.push(cell)
      const next = rowCells[index + 1]
      const east = next?.col === cell.col + 1 ? next : undefined
      const previousCandidates = run.filter(runCell => previousByCell.has(runCell.id))
      const mustCloseRun = !east
      const canCloseEarly = previousCandidates.length > 0 && hasPreviousAfter[index]
      const shouldCloseRun = mustCloseRun
        || (canCloseEarly && context.random.int(0, 1) === 0)

      if (shouldCloseRun) {
        if (previousCandidates.length > 0) {
          const linkFrom = context.random.pick(previousCandidates)
          const linkTo = previousByCell.get(linkFrom.id)!
          const edge = edgeBetween(linkFrom, linkTo)
          if (edge) {
            yield buildCarveStep(edge, linkFrom, linkTo)
          }
        }
        run = []
      }
      else if (east) {
        const edge = edgeBetween(cell, east)
        if (edge) {
          yield buildCarveStep(edge, cell, east)
        }
      }
    }
  }
}

function previousRowNeighbor(
  context: MazeContext<GridCell>,
  cell: GridCell,
): GridCell | undefined {
  return context.grid.getNeighbors(cell).find(neighbor => neighbor.row === cell.row - 1)
}

function previousCandidatesAfter(
  rowCells: GridCell[],
  previousByCell: Map<string, GridCell>,
): boolean[] {
  const result = Array.from({ length: rowCells.length }, () => false)
  let found = false
  for (let index = rowCells.length - 1; index >= 0; index -= 1) {
    const next = rowCells[index + 1]
    if (!next || next.col !== rowCells[index].col + 1) {
      found = false
    }
    result[index] = found
    if (previousByCell.has(rowCells[index].id)) {
      found = true
    }
  }
  return result
}
