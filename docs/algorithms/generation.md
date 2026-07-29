---
description: Compare twelve maze generation algorithms including DFS, Prim, Kruskal, Wilson, Eller, Sidewinder, and recursive division.
---

# Generation Algorithms

Generation algorithms create different passage patterns even though they all
produce valid mazes. Choose one based on the visual character you want, the
work it performs, and whether generation should begin at a specific cell.

All built-in generators finish with a spanning tree over a connected grid.
This means every active cell is reachable and there is exactly one route
between any two cells until the maze is edited.

## Choosing a Generation Algorithm

| ID                   | Algorithm             | Uses start | Character                                                   |
| -------------------- | --------------------- | :--------: | ----------------------------------------------------------- |
| `aldous-broder`      | Aldous-Broder         |     No     | Random walk; unbiased but often slow                        |
| `binary-tree`        | Binary Tree           |     No     | Fast with a strong diagonal bias                            |
| `dfs`                | Recursive Backtracker |    Yes     | Long corridors and deep branches                            |
| `eller`              | Eller's               |     No     | Row-oriented generation with low working memory             |
| `growing-tree`       | Growing Tree          |    Yes     | Newest-cell strategy; similar character to backtracking     |
| `hunt-and-kill`      | Hunt-and-Kill         |    Yes     | Random walks separated by visible row scans                 |
| `kruskal`            | Randomized Kruskal    |     No     | Joins many small regions into a spanning tree               |
| `prim`               | Randomized Prim       |    Yes     | Expands from a frontier with many short branches            |
| `recursive-division` | Recursive Division    |     No     | Starts open and adds walls recursively                      |
| `sidewinder`         | Sidewinder            |     No     | Horizontal runs with a directional bias                     |
| `traversal`          | Random Traversal      |    Yes     | Chooses a uniformly random edge from the active frontier    |
| `wilson`             | Wilson's              |     No     | Loop-erased random walks; unbiased spanning-tree generation |

`usesStart` is also available at runtime through
`MAZE_GENERATION_CAPABILITIES`.

If the application does not need a specific visual style, `dfs` is the
default. It is fast and produces long, recognizable corridors.

## Aldous-Broder

Aldous-Broder starts at a random cell and performs a random walk. It opens an
edge only when the walk first enters an unvisited cell. The result is an
unbiased uniform spanning tree, but the walk can spend a long time revisiting
cells near the end.

```ts
maze.generate('aldous-broder').finish()
```

It emits an initial `visit`, then one step for every random-walk move: `carve`
when entering a new cell and `visit` when moving to an already visited cell.
The payload therefore reports the walker's current cell even when the topology
does not change. The algorithm chooses its own initial cell and ignores the
generation `start` option.

**Simplified flow:**

1. Choose a random cell and mark it as visited.
2. Move to one randomly selected neighboring cell.
3. If that cell has not been visited, open the connecting edge and mark it.
4. Continue the random walk until every cell has been visited.

## Binary Tree

Binary Tree visits cells in row-major order and links each cell to a random
available north or west neighbor. It is fast and simple, but its directional
choice creates a visible diagonal bias and predictable corridors along the
top and left boundaries.

```ts
maze.generate('binary-tree').finish()
```

It emits one `carve` for each selected link and does not use `start`.

**Simplified flow:**

1. Read the cells from the top-left toward the bottom-right.
2. For each cell, collect its available north and west neighbors.
3. Choose one candidate at random and open the connecting edge.
4. Continue until every cell has been processed.

## Recursive Backtracker

The `dfs` ID selects recursive backtracking implemented iteratively. It is the
default generation algorithm because it is fast and produces recognizable,
long passages.

```ts
maze.generate('dfs', {
  start: { x: 0, y: 0 },
}).finish()
```

**Simplified flow:**

1. Put the starting cell on a stack and mark it as visited.
2. From the current cell, choose a random unvisited neighbor.
3. Open the connecting edge and push that neighbor onto the stack.
4. When no unvisited neighbor remains, pop the stack to backtrack.
5. Repeat until the stack is empty.

## Eller's

Eller's algorithm processes the grid row by row. It tracks connected sets
within the current row, joins some adjacent sets horizontally, and carries
each set into the next row through at least one vertical link. The final row
joins every remaining set.

```ts
maze.generate('eller').finish()
```

Its row-oriented behavior is useful for streaming-style generation and gives
the maze a visible horizontal structure. It emits `carve` steps and does not
use `start`.

**Simplified flow:**

1. Assign every ungrouped cell in the current row to a set.
2. Randomly join adjacent cells that belong to different sets.
3. Open at least one downward connection from each set into the next row.
4. Carry those set memberships forward and process the next row.
5. On the last row, join adjacent sets until only one connected region remains.

## Randomized Prim

Prim assigns a stable random weight when each frontier edge is discovered and
always carves the lowest-weight candidate next.

```ts
maze.generate('prim', {
  start: { x: 10, y: 10 },
}).finish()
```

The result tends to branch around the starting region rather than forming long
backtracking corridors.

**Simplified flow:**

1. Mark the starting cell and add its outgoing edges to a priority queue.
2. Give each newly discovered frontier edge a random weight.
3. Remove the lowest-weight edge from the queue.
4. If it reaches an unvisited cell, open it and add that cell's frontier edges.
5. Continue until the frontier is empty.

## Hunt-and-Kill

Hunt-and-Kill alternates between random walking and scanning rows for an
unvisited cell connected to the generated region. During the hunt phase it
emits `hunt-scan` steps:

```ts
const player = maze.generate('hunt-and-kill')

while (player.next()) {
  if (player.lastStep?.type === 'hunt-scan') {
    highlightRow(player.lastStep.payload.row)
  }
}
```

**Simplified flow:**

1. Begin a random walk from the starting cell.
2. Open a passage to a random unvisited neighbor whenever one exists.
3. When the walk gets stuck, scan the grid row by row.
4. Find an unvisited cell beside the generated region and connect it.
5. Resume the random walk and repeat until all cells are visited.

## Randomized Kruskal

Kruskal shuffles all grid edges, then uses disjoint sets to open an edge only
when it joins two previously separate components. Generation appears across
many disconnected regions before they merge into one spanning tree.

```ts
maze.generate('kruskal').finish()
```

Every accepted edge emits `carve`. The payload direction reflects the edge's
stored `from` and `to` cells, not a single moving generation head. Kruskal
does not use `start`.

**Simplified flow:**

1. Treat every cell as its own disconnected set.
2. Shuffle all possible internal edges.
3. Read the shuffled edges one at a time.
4. Open an edge only when its cells belong to different sets.
5. Merge those sets and continue until the grid is connected.

## Recursive Division

Most generators begin with closed edges and open passages. Recursive Division
does the reverse: generation starts with all internal edges open and emits
steps that close selected edges.

```ts
const player = maze.generate('recursive-division')
```

A renderer should respond to the step patches rather than assuming generation
always opens walls.

**Simplified flow:**

1. Start with every internal edge open.
2. Select one remaining rectangular region.
3. Split it with a horizontal or vertical wall, leaving one random passage.
4. Add the two resulting regions to the work list.
5. Continue until no region can be divided further.

## Growing Tree strategies

`maze.generate('growing-tree')` uses the `newest` strategy. Import the direct
factory to select another strategy:

```ts
import { createGrowingTreeAlgorithm } from 'mazely'

const newest = createGrowingTreeAlgorithm('newest')
const oldest = createGrowingTreeAlgorithm('oldest')
const random = createGrowingTreeAlgorithm('random')
```

**Simplified flow:**

1. Mark the starting cell and collect edges leading to unvisited cells.
2. Select a frontier edge according to the strategy: newest, oldest, or random.
3. Ignore it if its destination has already been visited.
4. Otherwise, open the edge and add the new cell's frontier edges.
5. Continue until no frontier edge remains.

## Sidewinder

Sidewinder builds horizontal runs from west to east. When it closes a run, it
chooses one cell in that run to connect north. The top row becomes a long
horizontal corridor and the rest of the maze has a strong directional bias.

```ts
maze.generate('sidewinder').finish()
```

It emits `carve` steps and does not use `start`. A masked gap ends the current
horizontal run.

**Simplified flow:**

1. Process one row from west to east while collecting a horizontal run.
2. Randomly decide whether to extend the run east or close it.
3. When closing, choose one cell in the run that can connect north.
4. Open that northern edge and begin a new run.
5. Repeat for every row.

## Random Traversal

Random Traversal is the random strategy of the Growing Tree family. It keeps
a frontier of edges leading out of the visited region and selects one
uniformly at random on every step.

```ts
maze.generate('traversal', {
  start: { x: 10, y: 10 },
}).finish()
```

It emits `carve` and uses `start`. Unlike Prim, frontier edges are chosen
directly rather than receiving a stable random priority when discovered.

**Simplified flow:**

1. Mark the starting cell and collect its frontier edges.
2. Choose one frontier edge uniformly at random.
3. Discard it if the destination has already been visited.
4. Otherwise, open it and add the destination's outgoing frontier edges.
5. Continue until the frontier is empty.

## Wilson's

Wilson's algorithm begins with one random cell in the tree. It repeatedly
performs a random walk from an unvisited cell, erases loops from that walk,
then carves the remaining path into the tree. Like Aldous-Broder, it produces
an unbiased uniform spanning tree.

```ts
maze.generate('wilson').finish()
```

Only the final loop-erased path emits `carve`; exploratory random-walk moves
are not exposed as steps. Wilson chooses its own roots and does not use
`start`.

**Simplified flow:**

1. Choose one random cell as the initial generated tree.
2. Start a random walk from another unvisited cell.
3. Whenever the walk returns to a cell already in its path, erase the loop.
4. Stop when the walk reaches the existing tree.
5. Open the loop-free path and repeat until every cell belongs to the tree.

## Masks

Every generator validates that active mask cells form one connected component.
A disconnected mask throws before changing any edge state.

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

maze.generate('wilson').finish()
```
