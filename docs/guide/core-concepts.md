---
description: Understand how Mazely represents maze topology, coordinates algorithm playback, uses seeds, and separates state from rendering.
---

# Core Concepts

This page builds the mental model used throughout the rest of the guide. It
assumes you have completed the [Quick Start](/guide/quick-start).

## Representing a Maze as a Graph

A maze may look like walls and corridors, but Mazely stores it as a graph:

- a `MazeGrid` contains cells and edges
- a `MazeCell` represents one location
- a `MazeEdge` connects two adjacent cells
- a closed edge behaves like a wall
- an open edge is a traversable connection

This model keeps topology independent from pixels. A Canvas renderer may draw
a closed edge as a line, while a 3D renderer may turn the same edge into a
wall mesh.

Square-grid cell IDs use the format `row:column`. Public inputs and solve
results use `{ x, y }` points. Convert between the two forms when needed:

```ts
import {
  cellIdToPoint,
  pointToCellId,
} from 'mazely'

pointToCellId({ x: 4, y: 2 }) // '2:4'
cellIdToPoint('2:4') // { x: 4, y: 2 }
```

## Moving Through the Lifecycle

A `Maze` instance has three phases:

| Phase      | Meaning                                          |
| ---------- | ------------------------------------------------ |
| `idle`     | No generation or solving player is active        |
| `generate` | Generation has started or completed              |
| `solve`    | Point-to-point solving or flood fill has started |

Starting generation prepares the edge state required by the selected
algorithm and clears previous solve metadata. Starting a solver keeps the
generated topology and replaces earlier solve metadata.

Generation must finish before solving begins:

```ts
const generation = maze.generate('dfs')
generation.finish()

const solving = maze.solve('bfs', {
  start: { x: 0, y: 0 },
  end: { x: 20, y: 20 },
})
```

## Controlling Algorithm Playback

Generation and solving algorithms produce steps lazily. `StepPlayer` controls
when those steps are applied:

```ts
const player = maze.generate('hunt-and-kill')

player.next() // Apply one step.
player.next(10) // Apply up to ten more.
player.prev() // Reverse one applied step.
player.reset() // Return to the beginning.
player.finish() // Apply everything that remains.
```

Before playback reaches the end, the final number of steps is unknown:

```ts
const player = maze.generate('wilson')

console.log(player.progress.totalSteps) // null
player.finish()
console.log(player.progress.totalSteps) // Exact final count
```

`bufferedSteps` reports how many lazy steps have been materialized so far.

## Understanding Steps and Patches

Each algorithm step contains:

- `type`, such as `carve` or `solve.expand`
- `patches`, which store the previous and next grid values
- `payload`, which provides renderer-friendly context such as `from`, `to`, or
  `depth`

```ts
const player = maze.generate('hunt-and-kill')

player.next()
console.log(player.lastStep?.type)
console.log(player.lastStep?.payload)
```

Moving forward applies each patch's `to` value. Moving backward restores its
`from` value. This allows exact rewind without rerunning random choices.

The grid is the source of truth for persistent walls and cell metadata. Step
payloads are most useful for temporary indicators such as a generation head,
a scanned row, or a flood depth.

## Reproducing Mazes with Seeds

Pass a string or number to reproduce random choices:

```ts
import { createMaze, serializeGrid } from 'mazely'

const first = createMaze({ seed: 'release-demo' })
const second = createMaze({ seed: 'release-demo' })

first.generate('kruskal').finish()
second.generate('kruskal').finish()

console.log(
  JSON.stringify(serializeGrid(first.grid))
  === JSON.stringify(serializeGrid(second.grid)),
) // true
```

Without a seed, each generation player receives a fresh random source.

## Keeping Rendering in the Application

A renderer usually needs three inputs:

1. the current grid
2. the most recently applied step
3. application-owned appearance state

Mazely does not schedule frames or draw the result. This allows one maze
instance to work with SVG, Canvas, WebGL, terminal output, or a custom game
renderer.

Continue with [Algorithms](/algorithms/) to choose generation and solving
behavior, or use the [Custom Renderer](/recipes/custom-renderer) recipe to turn
the grid into pixels.
