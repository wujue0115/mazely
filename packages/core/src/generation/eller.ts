import type { GridCell, MazeAlgorithm, MazeContext, MazeGenerationStep } from '../types'
import { buildPositionMap, cellAt, edgeBetween } from './grid-helpers'
import { buildCarveStep } from './shared'

class EllerAlgorithm implements MazeAlgorithm<GridCell, MazeGenerationStep> {
  name = 'eller';

  * generate(context: MazeContext<GridCell>): IterableIterator<MazeGenerationStep> {
    if (context.grid.type === 'triangle') {
      yield* generateTriangle(context)
      return
    }

    const byPosition = buildPositionMap(context.grid.cells)
    let nextSet = 1
    let incomingSets = new Map<string, number>()

    for (let row = 0; row < context.grid.rows; row += 1) {
      const rowCells: GridCell[] = []
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

      const cellsBySet = new Map<number, GridCell[]>()
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

export function createEllerAlgorithm(): MazeAlgorithm<GridCell, MazeGenerationStep> {
  return new EllerAlgorithm()
}

function* generateTriangle(
  context: MazeContext<GridCell>,
): IterableIterator<MazeGenerationStep> {
  const rows = Array.from({ length: context.grid.rows }, () => [] as GridCell[])
  for (const cell of context.grid.cells) {
    rows[cell.row].push(cell)
  }
  rows.forEach(cells => cells.sort((a, b) => a.col - b.col))

  let nextSet = 1
  let incomingSets = new Map<string, number>()

  for (const rowCells of rows) {
    if (rowCells.length === 0) {
      continue
    }

    const sets = new Map<string, number>()
    for (const cell of rowCells) {
      const set = incomingSets.get(cell.id) ?? nextSet
      if (!incomingSets.has(cell.id)) {
        nextSet += 1
      }
      sets.set(cell.id, set)
    }

    const downwardByCell = new Map(
      rowCells.flatMap((cell) => {
        const next = nextRowNeighbor(context, cell)
        return next ? [[cell.id, next] as const] : []
      }),
    )
    const lastRow = downwardByCell.size === 0

    for (let index = 0; index < rowCells.length - 1; index += 1) {
      const cell = rowCells[index]
      const east = rowCells[index + 1]
      if (east.col !== cell.col + 1) {
        continue
      }
      const leftSet = sets.get(cell.id)!
      const rightSet = sets.get(east.id)!
      if (leftSet === rightSet || (!lastRow && context.random.int(0, 1) !== 0)) {
        continue
      }
      const edge = edgeBetween(cell, east)
      if (edge) {
        yield buildCarveStep(edge, cell, east)
        mergeSet(sets, rightSet, leftSet)
      }
    }

    if (lastRow) {
      continue
    }

    while (true) {
      const carriedSets = new Set(
        rowCells.flatMap(cell => downwardByCell.has(cell.id) ? [sets.get(cell.id)!] : []),
      )
      const strandedSet = [...new Set(sets.values())]
        .find(set => !carriedSets.has(set))
      if (strandedSet === undefined) {
        break
      }

      const joins: Array<{ cell: GridCell, east: GridCell, otherSet: number }> = []
      for (let index = 0; index < rowCells.length - 1; index += 1) {
        const cell = rowCells[index]
        const east = rowCells[index + 1]
        if (east.col !== cell.col + 1) {
          continue
        }
        const leftSet = sets.get(cell.id)!
        const rightSet = sets.get(east.id)!
        if (leftSet === rightSet || (leftSet !== strandedSet && rightSet !== strandedSet)) {
          continue
        }
        joins.push({
          cell,
          east,
          otherSet: leftSet === strandedSet ? rightSet : leftSet,
        })
      }
      if (joins.length === 0) {
        break
      }

      const preferred = joins.filter(join => carriedSets.has(join.otherSet))
      const join = context.random.pick(preferred.length > 0 ? preferred : joins)
      const edge = edgeBetween(join.cell, join.east)
      if (!edge) {
        break
      }
      yield buildCarveStep(edge, join.cell, join.east)
      mergeSet(sets, strandedSet, join.otherSet)
    }

    incomingSets = new Map<string, number>()
    const cellsBySet = new Map<number, GridCell[]>()
    for (const cell of rowCells) {
      if (!downwardByCell.has(cell.id)) {
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
        const next = downwardByCell.get(cell.id)!
        const edge = edgeBetween(cell, next)
        if (edge) {
          incomingSets.set(next.id, set)
          yield buildCarveStep(edge, cell, next)
        }
      }
    }
  }
}

function nextRowNeighbor(context: MazeContext<GridCell>, cell: GridCell): GridCell | undefined {
  return context.grid.getNeighbors(cell).find(neighbor => neighbor.row === cell.row + 1)
}

function mergeSet(sets: Map<string, number>, from: number, to: number): void {
  for (const [cellId, set] of sets) {
    if (set === from) {
      sets.set(cellId, to)
    }
  }
}
