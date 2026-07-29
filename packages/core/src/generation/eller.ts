import type { MazeAlgorithm, MazeContext, MazeGenerationStep, SquareCell } from '../types'
import { buildPositionMap, cellAt, edgeBetween } from './grid-helpers'
import { buildCarveStep } from './shared'

class EllerSquareAlgorithm implements MazeAlgorithm<SquareCell, MazeGenerationStep> {
  name = 'eller';

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeGenerationStep> {
    const byPosition = buildPositionMap(context.grid.cells)
    let nextSet = 1
    let incomingSets = new Map<string, number>()

    for (let row = 0; row < context.grid.rows; row += 1) {
      const rowCells: SquareCell[] = []
      const sets = new Map<string, number>()
      for (let col = 0; col < context.grid.cols; col += 1) {
        const cell = cellAt(byPosition, row, col)
        if (!cell) {
          continue
        }
        rowCells.push(cell)
        const set = incomingSets.get(cell.id) ?? nextSet
        if (!incomingSets.has(cell.id)) {
          nextSet += 1
        }
        sets.set(cell.id, set)
      }

      const lastRow = !rowCells.some(cell => cellAt(byPosition, cell.row + 1, cell.col))

      for (let index = 0; index < rowCells.length - 1; index += 1) {
        const cell = rowCells[index]
        const east = rowCells[index + 1]
        if (east.col !== cell.col + 1) {
          continue
        }
        const leftSet = sets.get(cell.id)!
        const rightSet = sets.get(east.id)!
        const shouldJoin = leftSet !== rightSet && (lastRow || context.random.int(0, 1) === 0)
        if (!shouldJoin) {
          continue
        }

        const edge = edgeBetween(cell, east)
        if (edge) {
          yield buildCarveStep(edge, cell, east)
        }
        for (const [cellId, set] of sets) {
          if (set === rightSet) {
            sets.set(cellId, leftSet)
          }
        }
      }

      incomingSets = new Map<string, number>()
      if (lastRow) {
        continue
      }

      const cellsBySet = new Map<number, SquareCell[]>()
      for (const cell of rowCells) {
        const south = cellAt(byPosition, cell.row + 1, cell.col)
        if (!south) {
          continue
        }
        const set = sets.get(cell.id)!
        const cells = cellsBySet.get(set) ?? []
        cells.push(cell)
        cellsBySet.set(set, cells)
      }

      for (const [set, cells] of cellsBySet) {
        const shuffled = context.random.shuffle(cells)
        const linkCount = context.random.int(1, shuffled.length)
        for (const cell of shuffled.slice(0, linkCount)) {
          const south = cellAt(byPosition, cell.row + 1, cell.col)
          const edge = south ? edgeBetween(cell, south) : undefined
          if (south && edge) {
            incomingSets.set(south.id, set)
            yield buildCarveStep(edge, cell, south)
          }
        }
      }
    }
  }
}

export function createEllerAlgorithm(): MazeAlgorithm<SquareCell, MazeGenerationStep> {
  return new EllerSquareAlgorithm()
}
