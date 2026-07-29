import type { CellId, MazeAlgorithm, MazeContext, MazeGenerationStep, SquareCell } from '../types'
import { buildCarveStep } from './shared'

class UnionFind {
  private readonly parent: number[]
  private readonly rank: number[]

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i)
    this.rank = Array.from({ length: size }, () => 0)
  }

  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x])
    }
    return this.parent[x]
  }

  union(a: number, b: number): boolean {
    const ra = this.find(a)
    const rb = this.find(b)
    if (ra === rb) {
      return false
    }

    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb
    }
    else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra
    }
    else {
      this.parent[rb] = ra
      this.rank[ra] += 1
    }

    return true
  }
}

class KruskalSquareAlgorithm implements MazeAlgorithm<SquareCell, MazeGenerationStep> {
  name = 'kruskal';

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeGenerationStep> {
    const cellIndexById = new Map<CellId, number>()
    context.grid.cells.forEach((cell, index) => {
      cellIndexById.set(cell.id, index)
    })

    const uf = new UnionFind(context.grid.cells.length)
    const shuffled = context.random.shuffle(context.grid.edges)

    for (const edge of shuffled) {
      const fromIndex = cellIndexById.get(edge.from.id)
      const toIndex = edge.to ? cellIndexById.get(edge.to.id) : undefined
      if (fromIndex == null || toIndex == null || edge.to == null) {
        continue
      }

      if (!uf.union(fromIndex, toIndex)) {
        continue
      }

      yield buildCarveStep(edge, edge.from, edge.to)
    }
  }
}

export function createKruskalAlgorithm(): MazeAlgorithm<SquareCell, MazeGenerationStep> {
  return new KruskalSquareAlgorithm()
}
