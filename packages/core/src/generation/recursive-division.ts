import type { GridCell, MazeAlgorithm, MazeContext, MazeEdge, MazeGenerationStep } from '../types'
import { buildPositionMap, cellAt, edgeBetween } from './grid-helpers'

interface Region {
  top: number
  right: number
  bottom: number
  left: number
}

interface WallEdge {
  edge: MazeEdge
  from: GridCell
  to: GridCell
}

function buildSetEdgesStep(edges: WallEdge[], opened: boolean): MazeGenerationStep {
  return {
    type: opened ? 'open' : 'close',
    patches: edges.map(({ edge }) => ({ type: 'setEdgeOpened' as const, edgeId: edge.id, from: edge.opened, to: opened })),
    payload: { edges: edges.map(({ edge }) => edge.id) },
  }
}

class RecursiveDivisionAlgorithm implements MazeAlgorithm<GridCell, MazeGenerationStep> {
  name = 'recursive-division';

  * generate(context: MazeContext<GridCell>): IterableIterator<MazeGenerationStep> {
    if (context.grid.type !== 'square') {
      yield* generateGraph(context)
      return
    }

    const byPosition = buildPositionMap(context.grid.cells)
    const regions: Region[] = [{
      bottom: context.grid.rows - 1,
      left: 0,
      right: context.grid.cols - 1,
      top: 0,
    }]

    while (regions.length > 0) {
      const region = regions.pop()!
      const width = region.right - region.left + 1
      const height = region.bottom - region.top + 1
      if (width < 2 || height < 2) {
        continue
      }

      const vertical = width > height || (width === height && context.random.int(0, 1) === 0)
      if (vertical) {
        const wallCol = context.random.int(region.left, region.right - 1)
        const passageRow = context.random.int(region.top, region.bottom)
        const wallEdges: WallEdge[] = []
        for (let row = region.top; row <= region.bottom; row += 1) {
          if (row === passageRow) {
            continue
          }
          const left = cellAt(byPosition, row, wallCol)
          const right = cellAt(byPosition, row, wallCol + 1)
          const edge = left && right ? edgeBetween(left, right) : undefined
          if (edge?.opened) {
            wallEdges.push({ edge, from: left!, to: right! })
          }
        }
        if (wallEdges.length > 0) {
          yield buildSetEdgesStep(wallEdges, false)
        }
        regions.push(
          { ...region, right: wallCol },
          { ...region, left: wallCol + 1 },
        )
      }
      else {
        const wallRow = context.random.int(region.top, region.bottom - 1)
        const passageCol = context.random.int(region.left, region.right)
        const wallEdges: WallEdge[] = []
        for (let col = region.left; col <= region.right; col += 1) {
          if (col === passageCol) {
            continue
          }
          const top = cellAt(byPosition, wallRow, col)
          const bottom = cellAt(byPosition, wallRow + 1, col)
          const edge = top && bottom ? edgeBetween(top, bottom) : undefined
          if (edge?.opened) {
            wallEdges.push({ edge, from: top!, to: bottom! })
          }
        }
        if (wallEdges.length > 0) {
          yield buildSetEdgesStep(wallEdges, false)
        }
        regions.push(
          { ...region, bottom: wallRow },
          { ...region, top: wallRow + 1 },
        )
      }
    }
  }
}

export function createRecursiveDivisionAlgorithm(): MazeAlgorithm<GridCell, MazeGenerationStep> {
  return new RecursiveDivisionAlgorithm()
}

/**
 * Divide any non-square topology by cutting graph edges between two connected
 * regions.  This avoids inventing orthogonal walls for triangular or hexagonal
 * cells while retaining exactly one passage at each split.
 */
function* generateGraph(
  context: MazeContext<GridCell>,
): IterableIterator<MazeGenerationStep> {
  const regions = [[...context.grid.cells]]
  while (regions.length > 0) {
    const region = regions.pop()!
    if (region.length < 2) {
      continue
    }

    const partition = partitionGraphRegion(context, region)
    if (!partition) {
      continue
    }
    if (partition.wallEdges.length > 0) {
      yield buildSetEdgesStep(partition.wallEdges, false)
    }
    regions.push(partition.left, partition.right)
  }
}

function partitionGraphRegion(
  context: MazeContext<GridCell>,
  region: GridCell[],
): { left: GridCell[], right: GridCell[], wallEdges: WallEdge[] } | null {
  const regionIds = new Set(region.map(cell => cell.id))
  const root = context.random.pick(region)
  const order = [root]
  const childrenById = new Map<string, GridCell[]>()
  const visited = new Set([root.id])

  for (let index = 0; index < order.length; index += 1) {
    const cell = order[index]
    for (const neighbor of context.grid.getNeighbors(cell)) {
      if (!regionIds.has(neighbor.id) || visited.has(neighbor.id)) {
        continue
      }
      visited.add(neighbor.id)
      const children = childrenById.get(cell.id) ?? []
      children.push(neighbor)
      childrenById.set(cell.id, children)
      order.push(neighbor)
    }
  }
  if (order.length !== region.length) {
    return null
  }

  const subtreeSize = new Map<string, number>()
  for (let index = order.length - 1; index >= 0; index -= 1) {
    const cell = order[index]
    const size = 1 + (childrenById.get(cell.id) ?? [])
      .reduce((total, child) => total + subtreeSize.get(child.id)!, 0)
    subtreeSize.set(cell.id, size)
  }

  let bestDifference = Number.POSITIVE_INFINITY
  let splitCandidates: GridCell[] = []
  for (const cell of order.slice(1)) {
    const difference = Math.abs(region.length - 2 * subtreeSize.get(cell.id)!)
    if (difference < bestDifference) {
      bestDifference = difference
      splitCandidates = [cell]
    }
    else if (difference === bestDifference) {
      splitCandidates.push(cell)
    }
  }
  const splitRoot = context.random.pick(splitCandidates)
  const leftIds = new Set<string>()
  const queue = [splitRoot]
  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index]
    leftIds.add(cell.id)
    queue.push(...(childrenById.get(cell.id) ?? []))
  }

  const left = region.filter(cell => leftIds.has(cell.id))
  const right = region.filter(cell => !leftIds.has(cell.id))
  const crossing: WallEdge[] = []
  for (const cell of left) {
    for (const edge of cell.getEdges()) {
      const other = edge.getOther(cell) as GridCell | null
      if (other && regionIds.has(other.id) && !leftIds.has(other.id)) {
        crossing.push({ edge, from: cell, to: other })
      }
    }
  }
  if (crossing.length === 0) {
    return null
  }

  const passage = context.random.pick(crossing)
  return {
    left,
    right,
    wallEdges: crossing.filter(({ edge }) => edge !== passage.edge && edge.opened),
  }
}
