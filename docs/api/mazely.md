---
description: Create a Maze instance and coordinate its grid, generation, solving, playback, editing, state, and events.
---

# Maze API

The `Maze` interface coordinates one grid and its active generation or solving
player. Create an instance with `createMaze()` rather than constructing the
lower-level runtime class.

## `createMaze()`

Creates a square maze with an optional seed.

```ts
declare function createMaze(options?: CreateMazeOptions): Maze

interface CreateMazeOptions {
  grid?: MazeGridOptions
  seed?: string | number
}
```

### Example

```ts
import { createMaze } from 'mazely'

const maze = createMaze({
  grid: {
    type: 'square',
    rows: 15,
    cols: 25,
  },
  seed: 'example',
})
```

When `grid` is omitted, the factory creates a `21 × 21` square grid.

### Grid Options

```ts
interface MazeGridOptions {
  type: 'square'
  rows: number
  cols: number
  mask?: readonly (readonly boolean[])[]
}
```

Rows and columns must be positive integers. When provided, `mask` is indexed
as `mask[row][column]` and must leave at least one active cell.

## `maze.grid`

The grid owned by the instance:

```ts
interface Maze {
  readonly grid: MazeGrid<SquareCell>
}
```

The object remains stable for the lifetime of the maze. Algorithms and editing
methods change edge state and cell metadata inside it.

## `maze.generate()`

Starts a generation algorithm and returns its player:

```ts
interface MazelyGenerateOptions {
  start?: MazePoint
}

interface Maze {
  generate: (
    algorithm: MazeGenerationAlgorithm,
    options?: MazelyGenerateOptions,
  ) => StepPlayer<MazeGenerationStep>
}
```

```ts
const player = maze.generate('dfs', {
  start: { x: 0, y: 0 },
})
```

Starting generation clears previous solve state and initializes edges for the
selected algorithm. A start point affects only algorithms whose capability has
`usesStart: true`.

See [Generation Algorithms](/algorithms/generation) for supported IDs and
behavior.

## `maze.solve()`

Starts a point-to-point solver:

```ts
interface Maze {
  solve: (
    algorithm: Exclude<MazeSolvingAlgorithm, 'flood'>,
    options: {
      start: MazePoint
      end: MazePoint
    },
  ) => StepPlayer<MazeSolvingStep>
}
```

```ts
const player = maze.solve('bfs', {
  start: { x: 0, y: 0 },
  end: { x: 20, y: 20 },
})
```

Flood fill uses an overload without an end point:

```ts
interface Maze {
  solve: (
    algorithm: 'flood',
    options: { start: MazePoint },
  ) => StepPlayer<MazeSolvingStep>
}
```

Generation playback must finish before solving begins. Starting a solver
clears previous `solve.*` cell metadata.

## Playback Shortcuts

The maze delegates these methods to its active player:

```ts
interface Maze {
  next: (count?: number) => boolean
  prev: (count?: number) => boolean
  reset: () => void
}
```

```ts
maze.next(5)
maze.prev(2)
maze.reset()
```

They throw when generation or solving has not created a player. Access the
returned [`StepPlayer`](/api/step-player) when you need its progress, steps, or
`finish()` method.

## `maze.getState()`

Returns a snapshot of the current lifecycle and playback state:

```ts
interface Maze {
  getState: () => MazelyState
}
```

See [Events and State](/api/events) for the full shape and event behavior.

## `maze.getSolveResult()`

Reads the current solve result:

```ts
interface Maze {
  getSolveResult: () => SolveMazeResult | undefined
}
```

Returns `undefined` before a solver is selected. Point-to-point results contain
an ordered path from start to end. Flood results contain an empty path and the
number of reachable cells visited.

## Editing Methods

The instance exposes:

```ts
interface Maze {
  edit: (callback: (editor: MazeEditor) => void) => void
  setEdgeOpened: (edgeId: string, opened: boolean) => void
  setEdgeOpenedBetween: (
    from: MazePoint,
    to: MazePoint,
    opened: boolean,
  ) => void
  openCell: (point: MazePoint) => void
  closeCell: (point: MazePoint) => void
  openAllEdges: () => void
  closeAllEdges: () => void
  clearSolveState: () => void
}
```

See [Editing](/api/editing) for validation, transaction, and lifecycle rules.

## Event Methods

```ts
interface Maze {
  on: (
    event: MazeEventName,
    handler: MazeEventHandler,
  ) => () => void
  off: (
    event: MazeEventName,
    handler: MazeEventHandler,
  ) => void
}
```

See [Events and State](/api/events) for event names and payloads.
