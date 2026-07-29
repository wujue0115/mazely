# @mazely/core

Platform-agnostic maze generation and solving algorithms with step-based
execution. No DOM or Canvas dependencies — rendering and scheduling belong to
the app layer.

## Install

```bash
pnpm add @mazely/core
```

## Concepts

- **Grid** — cells connected by edges; an edge is a wall until it is opened.
- **Algorithm** — a generator that yields `MazeStep`s instead of mutating the grid directly. Generation and solving share the same shape.
- **StepPlayer** — applies steps forward (`next`) and backward (`prev`), so an
  application can inspect progress or run an algorithm to completion.

## Usage

```ts
import { Mazely } from '@mazely/core'

const maze = new Mazely({
  grid: { type: 'square', rows: 21, cols: 21 },
  seed: 42, // optional, makes runs reproducible
})

// Generate: step through or fast-forward.
const generation = maze.generate('dfs', { start: { x: 0, y: 0 } })
generation.next() // one step at a time
generation.finish() // or apply everything at once

// Solve: same player interface.
const solving = maze.solve('a-star', {
  start: { x: 0, y: 0 },
  end: { x: 20, y: 20 },
})
solving.finish()

const result = maze.getSolveResult()
// { solved: true, path: [{ x, y }, ...], visitedCount, algorithm }
```

Each applied step exposes a `payload` describing the carve/expand direction
(`from`/`to` cell IDs). Applications may use it as renderer input; the package
does not provide rendering or animation scheduling:

```ts
const step = generation.steps[generation.index - 1]
step.payload // { from: '0:0', to: '0:1' }

// Lazy players know the exact total only when the source is exhausted.
generation.progress
// { index, bufferedSteps, done, totalSteps: number | null }
```

## Algorithms

Generation: `aldous-broder`, `binary-tree`, `dfs`, `eller`,
`growing-tree`, `hunt-and-kill`, `kruskal`, `prim`,
`recursive-division`, `sidewinder`, `traversal`, and `wilson`.

- `prim` — Prim's algorithm on randomly weighted edges: each frontier edge gets a fixed random weight when discovered, and the minimum-weight edge is carved next.
- `traversal` — random traversal: a uniformly random frontier edge is carved on every step (a growing-tree variant; `createGrowingTreeAlgorithm(strategy)` exposes the shared implementation with `random`/`newest`/`oldest` strategies).

Solving: `bfs`, `dfs`, `best-first`, `a-star`, and `flood`.
`flood` performs breadth-first traversal from a start point until every
reachable cell is visited and does not require an end point.

```ts
maze.solve('flood', {
  start: { x: 0, y: 0 },
}).finish()
```

All generation algorithms support connected masks and finish with a spanning
tree. Generation rejects a disconnected mask before changing the grid.

Runtime registries and guards are exported as
`MAZE_GENERATION_ALGORITHMS`, `MAZE_SOLVING_ALGORITHMS`,
`isMazeGenerationAlgorithm()`, and `isMazeSolvingAlgorithm()`.

## Editing

`edit()` validates and stages the complete batch before applying it. If a
callback or operation throws, no edge changes or lifecycle events are kept.

```ts
maze.edit((editor) => {
  editor.closeAllEdges()
  editor.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, true)
})
```

## Traversal

Use `traverseGrid()` when an app needs every reachable cell without an end
point. Results contain topology-neutral cell IDs, depth, and parent IDs.

```ts
import { traverseGrid } from '@mazely/core'

const visits = traverseGrid(maze.grid, {
  startCellId: '0:0',
  strategy: 'bfs',
})
```

## Serialization

```ts
import { applySerializedGrid, serializeGrid } from '@mazely/core'

const saved = serializeGrid(maze.grid)
applySerializedGrid(otherMaze.grid, saved)
```

## Events

```ts
const off = maze.on('step', ({ state }) => {
  console.log(state.index, '/', state.totalSteps)
})
maze.on('complete', () => console.log('done')) // fires once per completion
off() // on() returns an unsubscribe function
```

## License

MIT
