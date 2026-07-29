---
description: Choose among Mazely's generation, pathfinding, and flood-fill algorithms and run them through one incremental API.
---

# Algorithms

Mazely includes twelve generation algorithms, four point-to-point solvers, and
one flood-fill traversal. They all use the same lazy playback model, so an
application can run them immediately or display their progress.

This section assumes you understand the lifecycle introduced in
[Core Concepts](/guide/core-concepts).

## Generating a Maze

Choose a generator by its visual character and execution behavior:

```ts
const generation = maze.generate('wilson')
generation.finish()
```

Every built-in generator:

- supports connected square-grid masks
- produces a spanning tree across all active cells
- is deterministic when the maze has a seed
- emits typed `MazeGenerationStep` values

The algorithms do not all use a start point. For example, DFS expands from a
chosen start, while Kruskal joins regions across the whole grid.

[Compare generation algorithms →](/algorithms/generation)

## Finding a Path

Point-to-point solvers require both a start and an end:

```ts
const solving = maze.solve('bfs', {
  start: { x: 0, y: 0 },
  end: { x: 20, y: 20 },
})

solving.finish()
```

Use `flood` when the problem has one start point and no destination. It visits
every reachable cell and reports each cell's distance depth.

[Compare solving algorithms →](/algorithms/solving)

## Building Algorithm Controls

The exported registries provide supported IDs and runtime capabilities:

```ts
import {
  isMazeGenerationAlgorithm,
  MAZE_GENERATION_ALGORITHMS,
  MAZE_GENERATION_CAPABILITIES,
} from 'mazely'

for (const algorithm of MAZE_GENERATION_ALGORITHMS) {
  console.log(
    algorithm,
    MAZE_GENERATION_CAPABILITIES[algorithm].usesStart,
  )
}

const value: unknown = readFromSettings()

if (isMazeGenerationAlgorithm(value)) {
  maze.generate(value)
}
```

Equivalent exports are available for solving:
`MAZE_SOLVING_ALGORITHMS`, `MAZE_SOLVING_CAPABILITIES`, and
`isMazeSolvingAlgorithm()`.

Store the string ID when persisting a selection. Registry array positions are
not stable serialized identifiers and may change between releases.

## Creating a Lower-Level Runtime

Most applications should use `createMaze()`. Direct algorithm factories are
available when you need to provide the grid, random source, and execution
runtime yourself:

```ts
import {
  createDfsAlgorithm,
  createRandom,
  createSquareGrid,
} from 'mazely'

const grid = createSquareGrid(9, 9)
const algorithm = createDfsAlgorithm({ x: 0, y: 0 })
const steps = algorithm.generate({
  grid,
  random: createRandom(42),
})
```

The returned iterator yields steps but does not apply them. Use
[`StepPlayer`](/api/step-player) or your own compatible runtime when working at
this level.
