# mazely

Maze generation, solving, and editing for TypeScript.

`mazely` is the recommended package entry point. It provides `createMaze()`
with practical defaults plus the complete public API and TypeScript types.

## Highlights

- Twelve deterministic generation algorithms and five solving algorithms
- Square, triangular, and hexagonal grids with connected-cell masks
- Triangular and hexagonal outer layouts, plus pointy/flat Hex orientation
- Seeded generation, reversible step playback, and transactional editing
- JSON-safe grid serialization with topology metadata

## Install

```bash
pnpm add mazely
```

```bash
npm install mazely
```

## Quick Start

```ts
import { createMaze } from 'mazely'

const maze = createMaze({
  grid: { type: 'square', cols: 21, rows: 21 },
  seed: 42,
})

maze.generate('dfs', { start: { x: 0, y: 0 } }).finish()
maze.solve('a-star', {
  start: { x: 0, y: 0 },
  end: { x: 20, y: 20 },
}).finish()

const result = maze.getSolveResult()
console.log(result?.solved, result?.path, result?.visitedCount)
```

`createMaze()` defaults to a `21 × 21` square grid. Supply `grid` to select a
topology, explicit dimensions, or a mask.

## Grid Topologies

Triangle grids use alternating up/down cells and support triangular or
rectangular outer boundaries:

```ts
const triangle = createMaze({
  grid: { type: 'triangle', layout: 'triangle', size: 20 },
  seed: 'triangles',
})

triangle.generate('prim').finish()
```

Hexagonal grids use regular six-sided cells. They support rectangular and
hexagonal outer boundaries, each with `pointy` or `flat` orientation:

```ts
const hexagon = createMaze({
  grid: {
    type: 'hexagon',
    layout: 'hexagon',
    size: 10,
    orientation: 'flat',
  },
  seed: 'hexagons',
})

hexagon.generate('dfs').finish()
```

Use `{ type: 'hexagon', layout: 'rectangle', rows, cols, orientation }` for a
rectangular Hex boundary. All grid types support connected boolean masks and
every built-in generation algorithm.

## Algorithms and Playback

Generation and solving return a `StepPlayer`. Call `next()` and `prev()` for
reversible playback, `reset()` to return to the initial state, or `finish()`
to complete immediately.

```ts
const player = maze.generate('prim')

while (player.next()) {
  const step = player.lastStep
  // Read step.payload and maze.grid to update application state.
}
```

Generation algorithms are `aldous-broder`, `binary-tree`, `dfs`, `eller`,
`growing-tree`, `hunt-and-kill`, `kruskal`, `prim`, `recursive-division`,
`sidewinder`, `traversal`, and `wilson`.

Solving algorithms are `a-star`, `best-first`, `bfs`, `dfs`, and `flood`.
`flood` visits every reachable cell and does not need an end point.

## Editing and Serialization

Use `maze.edit()` for transactional passage changes. Use `serializeGrid()` and
`applySerializedGrid()` to store and restore compatible grid topology and open
edges; serialized Hex data retains its layout, orientation, and side size.

```ts
import { applySerializedGrid, serializeGrid } from 'mazely'

const saved = serializeGrid(maze.grid)
applySerializedGrid(maze.grid, saved)
```

## Defaults

- maze size: `21 × 21`
- grid type: `square`
- generation algorithm: `dfs`

## Learn More

- [Documentation](https://mazely.dev)
- [Mazely Studio](https://studio.mazely.dev)
- [Core package](https://www.npmjs.com/package/@mazely/core)

## License

MIT
