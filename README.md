<br>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./docs/public/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="./docs/public/logo.svg">
    <img src="./docs/public/logo.svg" width="112" alt="Mazely logo">
  </picture>
</p>

<h1 align="center">Mazely</h1>

<p align="center">
  Maze generation, solving, and editing for TypeScript.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/mazely"><img src="https://img.shields.io/badge/npm-mazely-CB3837?logo=npm&logoColor=white" alt="mazely on npm"></a>
  <a href="https://www.npmjs.com/package/mazely"><img src="https://img.shields.io/npm/v/mazely?label=version" alt="npm version"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT license"></a>
</p>

<p align="center">
  <a href="https://mazely.dev">📚 Documentation</a> |
  <a href="https://studio.mazely.dev">🧩 Mazely Studio</a> |
  <a href="https://www.npmjs.com/package/mazely">📦 npm</a>
</p>

<br>

Mazely is a renderer-agnostic TypeScript toolkit for generating, solving, and
editing mazes. Its platform-independent core exposes algorithm progress as
steps. Applications can run an algorithm to completion or consume its progress
incrementally to build their own visualizations, teaching tools, games, and
renderers.

## Features

- Twelve maze generation algorithms and five solving algorithms
- `StepPlayer` API for incremental execution or immediate completion
- Deterministic generation with string or numeric seeds
- Square grids with optional masks for custom maze shapes
- Transactional maze editing and compact grid serialization
- No animation loop, DOM, Canvas, WebGL, or renderer dependency
- Full TypeScript types and ESM output

## Package Scope

Mazely provides maze state, algorithms, progress steps, events, editing, and
serialization. It does not draw a maze, schedule animation frames, or provide
playback UI controls.

[Mazely Studio](https://studio.mazely.dev) is a separate application built on
top of the packages. Its 2D and 3D rendering, animation timing, interface, and
export features belong to Studio and are not part of the `mazely` npm API.

## Packages

| Package                         | Description                                                                      |
| ------------------------------- | -------------------------------------------------------------------------------- |
| [`mazely`](packages/mazely)     | Recommended entry point with `createMaze()` defaults and the complete public API |
| [`@mazely/core`](packages/core) | Lower-level algorithms, grid model, step engine, editing, and serialization      |

Use `mazely` for applications and libraries. Reach for `@mazely/core` only when
you are assembling a lower-level runtime directly.

## Installation

```bash
pnpm add mazely
```

```bash
npm install mazely
```

For the core package directly:

```bash
pnpm add @mazely/core
```

## Quick Start

```ts
import { createMaze } from 'mazely'

const maze = createMaze({
  grid: {
    type: 'square',
    cols: 21,
    rows: 21,
  },
  seed: 42,
})

maze.generate('dfs', {
  start: { x: 0, y: 0 },
}).finish()

maze.solve('a-star', {
  start: { x: 0, y: 0 },
  end: { x: 20, y: 20 },
}).finish()

const result = maze.getSolveResult()

console.log(result?.solved)
console.log(result?.path)
console.log(result?.visitedCount)
```

`createMaze()` defaults to a `21 x 21` square grid. Pass `grid` when you need
explicit dimensions, a mask, or another supported topology.

## Incremental Execution

Generation and solving return the same `StepPlayer` interface. Use `next()` to
apply one algorithm step, `prev()` to revert one, `reset()` to return to the
beginning, or `finish()` when only the completed result matters.

```ts
const player = maze.generate('prim')

function advance() {
  if (!player.next())
    return

  const step = player.steps[player.index - 1]
  renderMaze(maze.grid, step) // Your renderer

  requestAnimationFrame(advance) // Your scheduler
}

requestAnimationFrame(advance)
```

`renderMaze()` is application code, not a Mazely export. Each step contains
grid patches and may include a `payload` with `from` and `to` cell IDs.
Rendering, timing, pause/resume behavior, and playback controls remain under
application control. `player.progress.totalSteps` is `null` while the lazy
source still has unknown steps and becomes exact after completion.

## Explicit Grid Configuration

```ts
import { createMaze } from 'mazely'

const maze = createMaze({
  grid: {
    type: 'square',
    rows: 31,
    cols: 31,
  },
  seed: 'repeatable-maze',
})

const generation = maze.generate('wilson')
generation.finish()
```

The main package also exports algorithm factories, grid types, `StepPlayer`,
serialization helpers, seeded random utilities, and all public TypeScript
types.

## Algorithms

### Generation

- `aldous-broder`
- `binary-tree`
- `dfs`
- `eller`
- `growing-tree`
- `hunt-and-kill`
- `kruskal`
- `prim`
- `recursive-division`
- `sidewinder`
- `traversal`
- `wilson`

### Solving

- `a-star`
- `best-first`
- `bfs`
- `dfs`
- `flood` (breadth-first traversal without an end point)

## Masked Mazes

Pass a boolean mask to include only selected cells. Excluded cells and their
edges are absent from the grid, so generation and solving stay inside the
shape.

```ts
import { createMaze } from 'mazely'

const maze = createMaze({
  grid: {
    type: 'square',
    rows: 3,
    cols: 3,
    mask: [
      [true, true, true],
      [true, false, true],
      [true, true, true],
    ],
  },
})
```

## Editing

Generated mazes can be edited without bypassing the grid model:

```ts
maze.setEdgeOpenedBetween(
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  true,
)

maze.closeCell({ x: 2, y: 2 })
maze.openAllEdges()
maze.closeAllEdges()
```

Edit callbacks are transactional: all targets are validated before changes are
committed. A thrown callback leaves the topology and lifecycle state unchanged.

## Serialization

Serialize the grid topology and restore it into another compatible grid:

```ts
import {
  applySerializedGrid,
  createMaze,
  serializeGrid,
} from 'mazely'

const source = createMaze({
  grid: { type: 'square', cols: 15, rows: 15 },
  seed: 7,
})
source.generate('kruskal').finish()

const saved = serializeGrid(source.grid)
const restored = createMaze({
  grid: { type: 'square', cols: 15, rows: 15 },
})

applySerializedGrid(restored.grid, saved)
```

## Events

```ts
const unsubscribe = maze.on('step', ({ state }) => {
  console.log(state.index, state.totalSteps)
})

maze.on('complete', ({ state }) => {
  console.log(`${state.phase} complete`)
})

unsubscribe()
```

Available events are `step`, `complete`, `reset`, `phaseChange`, and `edit`.

## Development

Requirements:

- Node.js 24
- pnpm 10.28.0

```bash
git clone https://github.com/wujue0115/mazely.git
cd mazely
pnpm install
pnpm test:ci
```

Common commands:

| Command          | Purpose                               |
| ---------------- | ------------------------------------- |
| `pnpm build`     | Build all packages and applications   |
| `pnpm typecheck` | Type-check the complete workspace     |
| `pnpm test`      | Run the Vitest suites                 |
| `pnpm lint`      | Run ESLint and formatting checks      |
| `pnpm test:ci`   | Run the complete release verification |

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branching model, commit
convention, and pull request checklist.

## License

[MIT](LICENSE) Copyright (c) 2026-PRESENT Wujue.
