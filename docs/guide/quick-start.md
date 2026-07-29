---
description: Install Mazely, generate a deterministic square maze, solve it with A-star, and read the resulting path.
---

# Quick Start

This guide creates a deterministic maze, finds a path through it, and reads the
result. It assumes basic familiarity with JavaScript or TypeScript and the
command line.

## Installing Mazely

Add Mazely to an existing project:

::: code-group

```sh [npm]
npm install mazely
```

```sh [pnpm]
pnpm add mazely
```

```sh [Yarn]
yarn add mazely
```

```sh [Bun]
bun add mazely
```

:::

For runtime requirements and TypeScript module settings, see
[Installation](/guide/installation).

## Creating a Maze

Import `createMaze()` and describe the grid you want:

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
```

Coordinates use `{ x, y }`, where `x` is the column and `y` is the row. This
maze runs from `{ x: 0, y: 0 }` in the top-left corner to
`{ x: 20, y: 20 }` in the bottom-right corner.

The `seed` makes every random choice reproducible. Running the same algorithm
with the same grid and seed produces the same topology.

If you omit `grid`, `createMaze()` creates a `21 × 21` square grid.

## Generating Passages

A new square grid starts with closed internal edges. Run a generation
algorithm to open passages:

```ts
const generation = maze.generate('dfs', {
  start: { x: 0, y: 0 },
})

generation.finish()
```

`generate()` returns a `StepPlayer`. Calling `finish()` applies every remaining
step and leaves the grid ready to solve.

## Finding a Path

After generation completes, select a solver and provide its start and end
points:

```ts
const solving = maze.solve('a-star', {
  start: { x: 0, y: 0 },
  end: { x: 20, y: 20 },
})

solving.finish()
```

Generation must finish before solving begins. This prevents the solver from
reading a partially generated topology.

## Reading the Result

`getSolveResult()` returns the completed path and search information:

```ts
const result = maze.getSolveResult()

if (result?.solved) {
  console.log('Visited cells:', result.visitedCount)
  console.log('Path:', result.path)
}
```

`path` contains `{ x, y }` points ordered from the start to the end. When no
route exists, `solved` is `false` and `path` is empty.

## Running One Step at a Time

Applications that visualize an algorithm can replace `finish()` with
`next()`:

```ts
const maze = createMaze({ seed: 'animated-example' })
const player = maze.generate('prim')

function frame() {
  player.next()
  render(maze.grid, player.lastStep)

  if (!player.done) {
    requestAnimationFrame(frame)
  }
}

requestAnimationFrame(frame)
```

Mazely updates the grid before exposing each applied step. `render()` and the
animation schedule belong to your application.

## Next Steps

- Read [Core Concepts](/guide/core-concepts) for the mental model behind grids,
  edges, steps, and playback.
- Compare the available [generation algorithms](/algorithms/generation) and
  [solving algorithms](/algorithms/solving).
- Build an application-owned animation loop with the
  [animation recipe](/recipes/animation).
