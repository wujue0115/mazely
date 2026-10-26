---
description: Serialize maze topology to JSON-safe data and apply it to a compatible Mazely grid.
---

# Serialization

The serialization API preserves grid topology, dimensions, and open edge IDs.
It does not serialize a `Maze` instance or `StepPlayer`.

For a complete persistence flow, see
[Saving and Restoring a Maze](/recipes/save-and-restore).

## `serializeGrid()`

Returns a JSON-safe topology value:

```ts
function serializeGrid(grid: MazeGrid): SerializedMaze

interface SerializedMaze {
  type?: 'square' | 'triangle' | 'hexagon' | 'circular'
  triangleLayout?: 'triangle' | 'rectangle'
  hexLayout?: 'hexagon' | 'rectangle'
  hexOrientation?: 'pointy' | 'flat'
  size?: number
  rings?: number
  ringCellCounts?: readonly number[]
  rows: number
  cols: number
  openedEdgeIds: string[]
}
```

```ts
import { serializeGrid } from 'mazely'

const data = serializeGrid(maze.grid)
const json = JSON.stringify(data)
```

## `applySerializedGrid()`

Applies serialized open-edge state to a compatible grid:

```ts
function applySerializedGrid(
  grid: MazeGrid,
  data: SerializedMaze,
): void
```

```ts
import {
  applySerializedGrid,
  createMaze,
} from 'mazely'

const restoredMaze = createMaze({
  grid: {
    type: 'square',
    rows: data.rows,
    cols: data.cols,
  },
})

applySerializedGrid(restoredMaze.grid, data)
```

The target dimensions must match. Unknown edge IDs are rejected before the
grid is modified. For circular grids, provided `rings` and `ringCellCounts`
must also match the target. These checks run before any edges change.

Restore a circular maze using its ring count:

```ts
const circular = createMaze({
  grid: { type: 'circular', rings: data.rings! },
})
applySerializedGrid(circular.grid, data)
```

This example assumes `data.type === 'circular'` and data returned by
`serializeGrid()`.

## Serialized Scope

The format preserves:

- grid type and triangle or hexagonal boundary shape
- rows and columns
- triangle or hexagonal side size
- hexagonal orientation
- circular ring count and per-ring sector counts
- open and closed internal edges

It does not preserve:

- generation or solving algorithm state
- playback position or buffered steps
- solve visits or path metadata
- appearance settings
- a mask as a separate field

When restoring a masked grid, construct the target with the same mask before
applying its serialized edge IDs.
