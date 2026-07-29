# mazely

Renderer-agnostic maze generation, solving, and editing for TypeScript.

## Install

```bash
pnpm add mazely
```

## Highlights

- Stable `createMaze()` entry point with the complete public API and types
- `createMaze()` with friendly defaults (21x21 square grid)

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

The package exposes incremental steps but does not provide rendering, animation
timing, or playback UI. Applications control those concerns with their own
renderer and scheduler. For serialization and the complete API, see the
[Mazely documentation](https://mazely.dev).

## Defaults

- maze size: `21 x 21`
- grid type: `square`

## License

MIT
