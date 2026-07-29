import type { CellId, MazeAlgorithm, MazeContext, MazeEdge, MazeGenerationStep, MazeGrid, SquareCell } from '../types'
import { buildCarveStep } from './shared'

class UnionFind {
  private readonly parent: number[]
  private readonly rank: number[]

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index)
    this.rank = Array.from({ length: size }, () => 0)
  }

  find(index: number): number {
    if (this.parent[index] !== index) {
      this.parent[index] = this.find(this.parent[index])
    }
    return this.parent[index]
  }

  union(left: number, right: number): boolean {
    const leftRoot = this.find(left)
    const rightRoot = this.find(right)
    if (leftRoot === rightRoot) {
      return false
    }

    if (this.rank[leftRoot] < this.rank[rightRoot]) {
      this.parent[leftRoot] = rightRoot
    }
    else if (this.rank[leftRoot] > this.rank[rightRoot]) {
      this.parent[rightRoot] = leftRoot
    }
    else {
      this.parent[rightRoot] = leftRoot
      this.rank[leftRoot] += 1
    }
    return true
  }
}

class SpanningTreeGenerationAlgorithm implements MazeAlgorithm<SquareCell, MazeGenerationStep> {
  readonly name: string

  constructor(private readonly algorithm: MazeAlgorithm<SquareCell, MazeGenerationStep>) {
    this.name = algorithm.name
  }

  * generate(context: MazeContext<SquareCell>): IterableIterator<MazeGenerationStep> {
    yield* this.algorithm.generate(context)
    yield* repairSpanningTree(context)
  }
}

export function withSpanningTreeGuarantee(
  algorithm: MazeAlgorithm<SquareCell, MazeGenerationStep>,
): MazeAlgorithm<SquareCell, MazeGenerationStep> {
  return new SpanningTreeGenerationAlgorithm(algorithm)
}

export function assertGridConnected(grid: MazeGrid<SquareCell>): void {
  const first = grid.cells[0]
  if (!first) {
    throw new TypeError('Cannot generate a maze without cells.')
  }

  const visited = new Set<CellId>([first.id])
  const queue: SquareCell[] = [first]
  for (let index = 0; index < queue.length; index += 1) {
    for (const neighbor of grid.getNeighbors(queue[index])) {
      if (visited.has(neighbor.id)) {
        continue
      }
      visited.add(neighbor.id)
      queue.push(neighbor)
    }
  }

  if (visited.size !== grid.cells.length) {
    throw new TypeError(
      `Cannot generate one maze across a disconnected grid (${visited.size}/${grid.cells.length} cells reachable).`,
    )
  }
}

function* repairSpanningTree(context: MazeContext<SquareCell>): IterableIterator<MazeGenerationStep> {
  const cellIndexById = new Map(
    context.grid.cells.map((cell, index) => [cell.id, index]),
  )
  const components = new UnionFind(context.grid.cells.length)

  for (const edge of context.grid.edges) {
    if (!edge.opened || !edge.to) {
      continue
    }
    const indices = getEdgeCellIndices(edge, cellIndexById)
    if (indices && components.union(indices.from, indices.to)) {
      continue
    }
    yield {
      patches: [{
        edgeId: edge.id,
        from: true,
        to: false,
        type: 'setEdgeOpened',
      }],
      payload: { edges: [edge.id] },
      type: 'generation.normalize.close',
    }
  }

  const closedEdges = context.random.shuffle(
    context.grid.edges.filter(edge => !edge.opened),
  )
  for (const edge of closedEdges) {
    if (!edge.to) {
      continue
    }
    const indices = getEdgeCellIndices(edge, cellIndexById)
    if (!indices || !components.union(indices.from, indices.to)) {
      continue
    }
    yield buildCarveStep(edge, edge.from, edge.to)
  }
}

function getEdgeCellIndices(
  edge: MazeEdge,
  cellIndexById: Map<CellId, number>,
): { from: number, to: number } | null {
  if (!edge.to) {
    return null
  }
  const from = cellIndexById.get(edge.from.id)
  const to = cellIndexById.get(edge.to.id)
  return from == null || to == null ? null : { from, to }
}
