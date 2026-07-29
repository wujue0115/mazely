---
description: Save Mazely topology as JSON and restore dimensions, masks, and open edges into a compatible grid.
---

# Saving and Restoring a Maze

Mazely serializes the finished maze topology rather than internal algorithm
playback. This produces small JSON data that can be stored in a database,
local storage, or a file.

## Saving Topology as JSON

Generate or edit the maze, then serialize its grid:

```ts
import { serializeGrid } from 'mazely'

const topology = serializeGrid(maze.grid)
const json = JSON.stringify(topology)

localStorage.setItem('maze', json)
```

The serialized value contains rows, columns, and open internal edge IDs.

## Restoring into a Compatible Grid

Create a grid with the saved dimensions before applying its open edges:

```ts
import {
  applySerializedGrid,
  createMaze,
} from 'mazely'

const topology = JSON.parse(localStorage.getItem('maze')!)
const restoredMaze = createMaze({
  grid: {
    type: 'square',
    rows: topology.rows,
    cols: topology.cols,
  },
})

applySerializedGrid(restoredMaze.grid, topology)
```

The target dimensions must match. Unknown edge IDs are rejected before any
target edge is changed.

Validate JSON from users, URLs, or remote storage before passing it to the
API.

## Preserving a Mask

`SerializedMaze` does not include a separate mask field. Store the mask next
to the topology:

```ts
const savedMaze = {
  mask,
  topology: serializeGrid(maze.grid),
}
```

Use the same mask when constructing the target:

```ts
const restoredMaze = createMaze({
  grid: {
    type: 'square',
    rows: savedMaze.topology.rows,
    cols: savedMaze.topology.cols,
    mask: savedMaze.mask,
  },
})

applySerializedGrid(restoredMaze.grid, savedMaze.topology)
```

## Deciding What Belongs in Application Data

Core serialization preserves:

- rows and columns
- open and closed internal edges

Store these separately when your application needs them:

- the mask
- start and end points
- selected algorithm IDs
- colors and other appearance settings
- application-specific labels or metadata

`StepPlayer` cursors, lazy generators, and partial animation state are not a
stable persistence format. Finish or reset playback before saving application
state.
