import type { CellId, MazeCell, MazeGrid } from './types'
import { getLinkedNeighbors } from './graph'

export type MazeTraversalStrategy = 'bfs' | 'dfs'

export interface MazeTraversalVisit {
  cellId: CellId
  depth: number
  parentId: CellId | null
}

export interface MazeTraversalOptions {
  startCellId: CellId
  strategy: MazeTraversalStrategy
}

/**
 * Traverses every cell reachable through open edges without mutating the grid.
 * Cell IDs keep this primitive independent of square-grid coordinates.
 */
export function traverseGrid<Cell extends MazeCell>(
  grid: MazeGrid<Cell>,
  options: MazeTraversalOptions,
): MazeTraversalVisit[] {
  const start = grid.getCell(options.startCellId)
  if (!start) {
    throw new RangeError(`start cell "${options.startCellId}" does not exist.`)
  }

  return options.strategy === 'dfs'
    ? traverseDepthFirst(grid, start)
    : traverseBreadthFirst(grid, start)
}

function traverseBreadthFirst<Cell extends MazeCell>(
  grid: MazeGrid<Cell>,
  start: Cell,
): MazeTraversalVisit[] {
  const visits: MazeTraversalVisit[] = []
  const queue: Array<{ cell: Cell, visit: MazeTraversalVisit }> = [{
    cell: start,
    visit: { cellId: start.id, depth: 0, parentId: null },
  }]
  const visited = new Set<CellId>([start.id])

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    visits.push(current.visit)
    for (const neighbor of getLinkedNeighbors(grid, current.cell)) {
      if (visited.has(neighbor.id)) {
        continue
      }
      visited.add(neighbor.id)
      queue.push({
        cell: neighbor,
        visit: {
          cellId: neighbor.id,
          depth: current.visit.depth + 1,
          parentId: current.cell.id,
        },
      })
    }
  }

  return visits
}

function traverseDepthFirst<Cell extends MazeCell>(
  grid: MazeGrid<Cell>,
  start: Cell,
): MazeTraversalVisit[] {
  const first = { cellId: start.id, depth: 0, parentId: null }
  const visits: MazeTraversalVisit[] = [first]
  const stack: Array<{ cell: Cell, visit: MazeTraversalVisit }> = [{
    cell: start,
    visit: first,
  }]
  const visited = new Set<CellId>([start.id])

  while (stack.length > 0) {
    const current = stack[stack.length - 1]
    const next = getLinkedNeighbors(grid, current.cell)
      .find(neighbor => !visited.has(neighbor.id))
    if (!next) {
      stack.pop()
      continue
    }

    const visit = {
      cellId: next.id,
      depth: current.visit.depth + 1,
      parentId: current.cell.id,
    }
    visited.add(next.id)
    stack.push({ cell: next, visit })
    visits.push(visit)
  }

  return visits
}
