---
description: Browse the public mazely TypeScript API for maze creation, playback, grids, editing, events, traversal, and serialization.
---

# API Reference

This section documents the public exports from `mazely`. It is intended for
lookup rather than sequential reading. Begin with the
[Guide](/guide/) if you are new to the package.

## Application API

Most applications begin with `createMaze()`:

```ts
import { createMaze } from 'mazely'

const maze = createMaze({ seed: 'api-example' })
```

| API                                      | Purpose                                        |
| ---------------------------------------- | ---------------------------------------------- |
| [`createMaze()` and `Maze`](/api/mazely) | Create and coordinate one maze instance        |
| [`StepPlayer`](/api/step-player)         | Run, rewind, reset, or finish an algorithm     |
| [Steps and payloads](/api/steps)         | Read typed algorithm progress                  |
| [Editing](/api/editing)                  | Change passages and keep lifecycle state valid |
| [Events and state](/api/events)          | Observe playback, phases, and manual edits     |

## Grid and Persistence API

Lower-level helpers are exported from the same package:

```ts
import {
  createSquareGrid,
  serializeGrid,
  traverseGrid,
} from 'mazely'
```

| API                                 | Purpose                                           |
| ----------------------------------- | ------------------------------------------------- |
| [Grid and graph](/api/grid)         | Read cells, edges, neighbors, and reachable cells |
| [Serialization](/api/serialization) | Save and restore square-grid topology             |

## Public Defaults

```ts
import {
  DEFAULT_MAZE_SIZE,
  MAZELY_DEFAULTS,
} from 'mazely'

DEFAULT_MAZE_SIZE
// { cols: 21, rows: 21 }

MAZELY_DEFAULTS
// { generationAlgorithm: 'dfs', solvingAlgorithm: 'bfs' }
```

Both values are frozen runtime objects.

## Importing Types

Public types include algorithm IDs, factory options, grid primitives, step
unions, event payloads, traversal visits, serialization data, and solve
results:

```ts
import type {
  Maze,
  MazeGenerationStep,
  MazePoint,
  MazeSolvingAlgorithm,
  SolveMazeResult,
} from 'mazely'
```

`Maze` is declared by the `mazely` package. Lower-level types are re-exported
from `@mazely/core`, so applications normally do not need a second dependency.
