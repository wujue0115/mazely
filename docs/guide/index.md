---
description: Learn what Mazely is, which problems it solves, and how its TypeScript API fits into an application.
---

# Introduction

## What Is Mazely?

Mazely is a TypeScript toolkit for creating and working with mazes. It provides
the data model and algorithms needed to:

- generate reproducible mazes
- find paths and explore reachable cells
- edit walls and passages
- save and restore maze topology
- observe algorithm progress one step at a time

Here is a complete example:

```ts
import { createMaze } from 'mazely'

const maze = createMaze({
  grid: { type: 'square', cols: 21, rows: 21 },
  seed: 'first-maze',
})

maze.generate('dfs').finish()
maze.solve('a-star', {
  start: { x: 0, y: 0 },
  end: { x: 20, y: 20 },
}).finish()

const result = maze.getSolveResult()

if (result?.solved) {
  console.log(result.path)
}
```

This example demonstrates two parts of Mazely's design:

- **One maze model:** generation, solving, editing, and serialization operate
  on the same grid.
- **Your application controls execution:** algorithms can finish immediately
  or advance one step at a time.

## Where Mazely Can Run

Mazely's data model and algorithms work in browsers, Node.js processes,
workers, game engines, and test environments. Applications can connect the
same grid state to Canvas, SVG, WebGL, terminal output, or another interface.

If you need a ready-to-use visual workspace, open
[Mazely Studio](https://studio.mazely.dev).

## How Mazely Runs Algorithms

`generate()` and `solve()` return a `StepPlayer`. You can choose the execution
style that fits your application:

```ts
const player = maze.generate('prim')

player.finish() // Apply every remaining step.
```

Or advance incrementally:

```ts
const player = maze.generate('prim')

player.next()
player.next(10)
player.prev()
player.reset()
```

Incremental execution is useful for visualizations, teaching tools, editors,
and any interface that needs pause, replay, or step controls. Applications
that only need the finished topology can use `finish()`.

## When to Use Mazely

Mazely is a good fit when an application needs reusable maze algorithms and
explicit control over their execution. Common uses include:

- games and procedural levels
- algorithm visualizations
- maze editors
- pathfinding demonstrations
- generated puzzles
- deterministic fixtures and tests

Mazely currently supports square grids. Triangle, hexagonal, and polar grid
topologies are not included in v0.1.

## What to Read Next

If you want to start coding, follow the [Quick Start](/guide/quick-start). It
includes installation and a complete generate-and-solve example.

For project requirements and package-manager commands, see
[Installation](/guide/installation). Continue with
[Core Concepts](/guide/core-concepts) when you want to understand grids,
steps, and playback.
