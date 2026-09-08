# mazely

Renderer-agnostic maze generation, solving, and editing for TypeScript.

## Install

```bash
pnpm add mazely
```

## Highlights

- Stable `createMaze()` entry point with the complete public API and types
- Square, triangular, and hexagonal grids with a friendly 21x21 square default

## Usage

```ts
import { createMaze } from 'mazely'

const maze = createMaze({
  grid: { type: 'square', cols: 21, rows: 21 },
  seed: 42,
})

maze.generate('dfs').finish()
maze.solve('bfs', { start: { x: 0, y: 0 }, end: { x: 20, y: 20 } }).finish()

const result = maze.getSolveResult()
console.log(result?.solved, result?.path.length)
```

Triangular grids use alternating up/down cells and can have a triangular or
rectangular outer boundary:

```ts
const triangle = createMaze({
  grid: { type: 'triangle', layout: 'triangle', size: 20 },
  seed: 'triangles',
})

triangle.generate('dfs').finish()
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
rectangular outer boundary. Hexagonal grids support connected masks and every
built-in generation algorithm.

The package exposes incremental steps but does not provide rendering, animation
timing, or playback UI. Applications control those concerns with their own
renderer and scheduler. For serialization and the complete API, see the
[Mazely documentation](https://mazely.dev).

## Defaults

- maze size: `21 x 21`
- grid type: `square`

## License

MIT
