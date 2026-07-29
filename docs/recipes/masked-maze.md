---
description: Exclude square-grid cells with a boolean mask and generate a connected maze inside an application-defined shape.
---

# Generating a Shaped Maze

A mask excludes cells from a square grid. Use one when the maze should follow
a logo, room outline, image silhouette, or another non-rectangular shape.

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

Pass the mask with matching grid dimensions:

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

## Keeping Active Cells Connected

Every active cell must be reachable from every other active cell through
horizontal or vertical neighbors. This mask is disconnected:

```ts
const disconnectedMask = [
  [true, false],
  [false, true],
]
```

Diagonal contact does not connect square cells. Generation rejects a
disconnected mask before changing edge state.

Applications that create masks from images can run a four-directional flood
fill first to provide more specific feedback. Mazely still performs its own
connectivity validation.

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

A mask changes the shape of a square grid; it does not create triangle,
hexagonal, or polar cells. Those topologies require different neighbor and
edge rules and are not included in v0.1.

To persist a masked maze, store the mask next to the serialized topology. See
[Saving and Restoring a Maze](/recipes/save-and-restore).
