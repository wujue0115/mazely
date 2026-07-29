---
description: Choose A-star, breadth-first, depth-first, greedy best-first, or flood fill for maze pathfinding and traversal.
---

# Solving Algorithms

Solvers traverse open edges. Generate a maze or build its passages with the
editing API before starting solve playback.

## Choosing a Solving Algorithm

| ID           | Algorithm                | Needs an end | Shortest path |
| ------------ | ------------------------ | :----------: | :-----------: |
| `a-star`     | A\* Search               |     Yes      |      Yes      |
| `bfs`        | Breadth-First Search     |     Yes      |      Yes      |
| `best-first` | Greedy Best-First Search |     Yes      |      No       |
| `dfs`        | Depth-First Search       |     Yes      |      No       |
| `flood`      | Breadth-First Flood Fill |      No      |      N/A      |

A freshly generated maze is a spanning tree, so it has only one route between
any two cells. Every point-to-point solver returns that same route, but each
one explores the grid in a different order. Shortest-path guarantees become
important after editing creates loops.

## Finding a Shortest Path

A\* and Breadth-First Search both guarantee a shortest path on Mazely's
unweighted grid.

### A\* Search

A\* combines the distance already traveled with a Manhattan-distance estimate
to the destination. This tends to focus exploration toward the end point.

```ts
maze.generate('kruskal').finish()

maze.solve('a-star', {
  start: { x: 0, y: 0 },
  end: { x: 20, y: 20 },
}).finish()

const result = maze.getSolveResult()
```

**Simplified flow:**

1. Add the start cell to a priority queue with distance `0`.
2. Remove the cell with the lowest traveled distance plus estimated distance.
3. Check each neighbor connected through an open edge.
4. Record a neighbor when this route reaches it with a lower cost.
5. Continue until the end is removed from the queue or no candidate remains.

### Breadth-First Search

Use BFS when you want breadth-first exploration without a heuristic. It is
also the foundation for distance layers and flood fill.

```ts
maze.solve('bfs', {
  start: { x: 0, y: 0 },
  end: { x: 20, y: 20 },
}).finish()
```

**Simplified flow:**

1. Mark the start cell and add it to a queue.
2. Remove the oldest cell from the front of the queue.
3. Add each unvisited, openly connected neighbor to the back.
4. Record the current cell as the neighbor's parent.
5. Continue by distance layers until the end is reached or the queue is empty.

The result describes the selected algorithm, whether the destination was
reached, the ordered path, and the number of visited cells:

```ts
interface SolveMazeResult {
  algorithm: MazeSolvingAlgorithm
  solved: boolean
  path: MazePoint[]
  visitedCount: number
}
```

An unreachable destination returns `solved: false`, an empty path, and the
number of cells explored.

## Exploring Quickly without a Shortest-Path Guarantee

### Greedy Best-First Search

Greedy Best-First Search prioritizes cells that appear closer to the
destination. It may visit fewer cells in a favorable layout, but it does not
guarantee the shortest route when loops provide alternatives.

```ts
maze.solve('best-first', {
  start: { x: 0, y: 0 },
  end: { x: 20, y: 20 },
}).finish()
```

**Simplified flow:**

1. Add the start cell to a priority queue.
2. Remove the cell with the smallest estimated distance to the end.
3. Mark each unvisited, openly connected neighbor.
4. Add those neighbors to the queue using only their destination estimate.
5. Continue until the end is selected or the queue is empty.

### Depth-First Search

Depth-First Search follows one branch until it must backtrack. It creates a
distinct exploration pattern and can test reachability with low bookkeeping,
but it also does not guarantee the shortest route.

```ts
maze.solve('dfs', {
  start: { x: 0, y: 0 },
  end: { x: 20, y: 20 },
}).finish()
```

**Simplified flow:**

1. Put the start cell on a stack and mark it as visited.
2. Move to the first unvisited neighbor connected through an open edge.
3. Record its parent and push it onto the stack.
4. If the current cell has no unvisited neighbor, pop the stack.
5. Continue until the end is found or the stack is empty.

## Visiting Every Reachable Cell

Flood fill has a start point but no destination:

```ts
const player = maze.solve('flood', {
  start: { x: 0, y: 0 },
})

while (player.next()) {
  const step = player.lastStep

  if (step?.type === 'solve.flood') {
    colorByDepth(step.payload.to, step.payload.depth)
  }
}
```

Each flood step contains a breadth-first `depth`, which is useful for distance
fields, heat maps, and reachability visualizations.

**Simplified flow:**

1. Add the start cell to a queue with depth `0`.
2. Remove the oldest queued cell and emit its depth.
3. Add every unvisited, openly connected neighbor with depth plus one.
4. Record the current cell as each new neighbor's parent.
5. Continue until the queue is empty.

Its solve result has no point-to-point path:

```ts
const result = maze.getSolveResult()
// { algorithm: 'flood', solved: true, path: [], visitedCount: ... }
```
