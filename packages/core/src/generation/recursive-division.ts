import type { MazeAlgorithm, MazeContext, MazeEdge, MazeGenerationStep, SquareCell } from '../types'
import { buildPositionMap, cellAt, edgeBetween } from './grid-helpers'

interface Region {
  top: number
  right: number
  bottom: number
  left: number
}

interface WallEdge {
  edge: MazeEdge
  from: SquareCell
  to: SquareCell
}

function buildSetEdgesStep(edges: WallEdge[], opened: boolean): MazeGenerationStep {
  return {
    type: opened ? 'open' : 'close',
    patches: edges.map(({ edge }) => ({ type: 'setEdgeOpened' as const, edgeId: edge.id, from: edge.opened, to: opened })),
    payload: { edges: edges.map(({ edge }) => edge.id) },
  }
}

class RecursiveDivisionSquareAlgorithm implements MazeAlgorithm<SquareCell, MazeGenerationStep> {
  name = 'recursive-division';

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeGenerationStep> {
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

export function createRecursiveDivisionAlgorithm(): MazeAlgorithm<SquareCell, MazeGenerationStep> {
  return new RecursiveDivisionSquareAlgorithm()
}
