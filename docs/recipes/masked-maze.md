---
description: Exclude square or triangle grid cells with a boolean mask and generate a connected maze inside an application-defined shape.
---

# Generating a Shaped Maze

A mask excludes cells from a square or triangular grid. Use one when the maze
should follow a logo, room outline, image silhouette, or another custom shape.

## Describing the Shape

A mask is indexed as `mask[row][column]`. `true` keeps a cell and `false`
removes it:

```ts
const mask = [
  [true, true, true, true, true],
  [true, false, false, false, true],
  [true, true, true, true, true],
] as const
```

Pass the mask with matching square-grid dimensions:

```ts
import { createMaze } from 'mazely'

const maze = createMaze({
  grid: {
    type: 'square',
    rows: mask.length,
    cols: mask[0].length,
    mask,
  },
  seed: 'masked-example',
})

maze.generate('wilson').finish()
```

Excluded cells and their attached edges do not exist in `maze.grid`.

Triangle grids accept masks too. For a triangular outer layout, row `r` has
`2r + 1` cells, so each mask row should follow that shape:

```ts
const triangleMask = [
  [true],
  [true, true, true],
  [true, true, false, true, true],
] as const

const triangleMaze = createMaze({
  grid: {
    type: 'triangle',
    layout: 'triangle',
    size: triangleMask.length,
    mask: triangleMask,
  },
})

triangleMaze.generate('dfs').finish()
```

A rectangular triangle layout uses an ordinary `rows × cols` mask. The cells
are still triangles; `layout` changes only the outer boundary.

## Keeping Active Cells Connected

Every active cell must be reachable from every other active cell through a
shared grid edge. This square mask is disconnected:

```ts
const disconnectedMask = [
  [true, false],
  [false, true],
]
```

Diagonal contact does not connect square cells. Triangle cells have at most
three neighbors: left, right, and one vertical neighbor determined by their
orientation. Generation validates connectivity using the selected grid's
actual edges and rejects a disconnected mask before changing edge state.

Applications that create square-grid masks from images can run a
four-directional flood fill first to provide more specific feedback. A
triangle-grid image converter must instead use triangle-cell coverage and
triangle adjacency. Mazely still performs its own connectivity validation.

## Choosing Valid Start and End Points

Generation and solving coordinates must refer to active cells:

```ts
maze.generate('dfs', {
  start: { x: 0, y: 0 },
}).finish()

maze.solve('bfs', {
  start: { x: 0, y: 0 },
  end: { x: 4, y: 2 },
}).finish()
```

A point outside the grid or on an excluded cell throws a `RangeError`.

## Understanding the Topology

A mask removes cells but does not change their topology. Use `type: 'square'`
for four-sided cells or `type: 'triangle'` for alternating three-sided cells;
the mask is interpreted using that grid's neighbor and edge rules.

To persist a masked maze, store the mask next to the serialized topology. See
[Saving and Restoring a Maze](/recipes/save-and-restore).
