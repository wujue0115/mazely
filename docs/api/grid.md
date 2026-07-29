---
description: Reference Mazely grid, cell, edge, graph traversal, neighbor, connectivity, and square-grid APIs.
---

# Grid & Graph

The grid API exposes topology without assuming how an application renders or
traverses it. Most applications access a grid through `maze.grid`; the
low-level factory is available for custom runtimes.

## `MazeGrid`

```ts
interface MazeGrid<Cell extends MazeCell = MazeCell> {
  readonly rows: number
  readonly cols: number
  readonly cells: Cell[]
  readonly edges: MazeEdge[]
  getCell: (id: CellId) => Cell | undefined
  getNeighbors: (cell: Cell) => Cell[]
  getEdges: (cell: Cell) => MazeEdge[]
}
```

`getNeighbors()` returns topological neighbors regardless of whether their
connecting edge is open. Use `getLinkedNeighbors()` for traversable neighbors.

## `createSquareGrid()`

Creates a square grid without a `Maze` lifecycle:

```ts
function createSquareGrid(
  rows: number,
  cols: number,
  mask?: SquareGridMask,
): MazeGrid<SquareCell>
```

```ts
import { createSquareGrid } from 'mazely'

const grid = createSquareGrid(10, 20)
```

Rows and columns must be positive integers. A mask can exclude cells:

```ts
const grid = createSquareGrid(3, 3, [
  [true, true, true],
  [true, false, true],
  [true, true, true],
])
```

Edges connected to excluded cells are not created.

## Cell IDs and Coordinates

`SquareCell` exposes `row`, `col`, directional edge references, metadata, and
base cell methods.

```ts
const cell = maze.grid.getCell('2:4')

cell?.getEdges()
cell?.getNeighbors()
cell?.getMeta('solve.visited')
```

```ts
pointToCellId({ x: 4, y: 2 }) // '2:4'
cellIdToPoint('2:4') // { x: 4, y: 2 }
```

## `MazeEdge`

```ts
class MazeEdge {
  readonly id: string
  readonly from: MazeCell
  readonly to: MazeCell | null
  readonly opened: boolean

  open(): void
  close(): void
  getOther(cell: MazeCell): MazeCell | null
}
```

`from` and `to` identify the cells connected by the edge. Their order is an
implementation detail of grid construction, not a traversal direction; use
`getOther(cell)` when navigating from a known cell.

`MazeEdge` permits `to: null` for topology implementations that represent an
outer boundary as an edge. `createSquareGrid()` instead represents outer and
masked boundaries as `null` entries in `SquareCell.edges`, so every item in
its `grid.edges` connects two cells.

```ts
edge.opened
edge.open()
edge.close()
edge.getOther(cell)
```

Prefer the [editing API](/api/editing) for application changes because it
validates targets and resets lifecycle state consistently.

Calling `edge.open()` or `edge.close()` directly changes only that edge. It
does not clear solve metadata, reset the active player, change the maze
phase, or emit an `edit` event. Direct mutation is appropriate while
constructing a fresh low-level grid or decoder; use the maze editing methods
for an active application instance.

## Graph Helpers

### `getLinkedNeighbors(grid, cell)`

Returns cells connected to `cell` through open edges.

### `getReachableCellIds(grid, startCellId)`

Returns a `Set<CellId>` containing every cell reachable through open edges.

### `areCellsDirectlyLinked(grid, leftId, rightId)`

Returns whether two existing cells share an open edge.

## `traverseGrid(grid, options)`

Traverses reachable cells without mutating the grid.

```ts
const visits = traverseGrid(maze.grid, {
  startCellId: '0:0',
  strategy: 'bfs',
})
```

Each visit contains topology-neutral IDs:

```ts
interface MazeTraversalVisit {
  cellId: CellId
  depth: number
  parentId: CellId | null
}
```

Strategies are `bfs` and `dfs`.
