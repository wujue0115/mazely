import type { CellId, MazeAlgorithm, MazeContext, MazeEdge, MazeGenerationStep, MazePoint, SquareCell } from '../types'
import { buildCarveStep, resolveStartCell } from './shared'

/**
 * How the growing-tree algorithm picks the next frontier edge:
 * - `random`: uniformly random on every step — the classic random traversal.
 * - `newest`: last added — produces long corridors, similar to DFS.
 * - `oldest`: first added — expands breadth-first from the start cell.
 */
export type GrowingTreeStrategy = 'random' | 'newest' | 'oldest'

interface FrontierEdge {
  edge: MazeEdge
  from: SquareCell
  to: SquareCell
}

class GrowingTreeSquareAlgorithm implements MazeAlgorithm<SquareCell, MazeGenerationStep> {
  constructor(
    public readonly name: string,
    private readonly strategy: GrowingTreeStrategy,
    private readonly start?: MazePoint,
  ) {}

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeGenerationStep> {
    const first = resolveStartCell(context, this.start)
    if (!first) {
      return
    }

    const visited = new Set<CellId>([first.id])
    const frontier: FrontierEdge[] = []

    this.pushFrontierEdges(context, first, visited, frontier)

    while (frontier.length > 0) {
      const pickIndex = this.pickIndex(context, frontier.length)
      const [picked] = frontier.splice(pickIndex, 1)
      if (visited.has(picked.to.id)) {
        continue
      }

      visited.add(picked.to.id)
      yield buildCarveStep(picked.edge, picked.from, picked.to)
      this.pushFrontierEdges(context, picked.to, visited, frontier)
    }
  }

  private pickIndex(context: MazeContext<SquareCell>, length: number): number {
    if (this.strategy === 'newest')
      return length - 1
    if (this.strategy === 'oldest')
      return 0
    return context.random.int(0, length - 1)
  }

  private pushFrontierEdges(
    context: MazeContext<SquareCell>,
    cell: SquareCell,
    visited: Set<CellId>,
    frontier: FrontierEdge[],
  ): void {
    const candidates: FrontierEdge[] = []
    for (const edge of context.grid.getEdges(cell)) {
      const other = edge.getOther(cell) as SquareCell | null
      if (!other || visited.has(other.id)) {
        continue
      }
      candidates.push({ edge, from: cell, to: other })
    }

    for (const candidate of context.random.shuffle(candidates)) {
      frontier.push(candidate)
    }
  }
}

export function createGrowingTreeAlgorithm(
  strategy: GrowingTreeStrategy,
  start?: MazePoint,
): MazeAlgorithm<SquareCell, MazeGenerationStep> {
  return new GrowingTreeSquareAlgorithm(`growing-tree-${strategy}`, strategy, start)
}

export function createTraversalAlgorithm(start?: MazePoint): MazeAlgorithm<SquareCell, MazeGenerationStep> {
  return new GrowingTreeSquareAlgorithm('traversal', 'random', start)
}
