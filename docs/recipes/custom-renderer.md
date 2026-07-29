---
description: Draw Mazely grid state and solution progress with an application-owned Canvas, SVG, WebGL, terminal, or game renderer.
---

# Building a Custom Renderer

Mazely stores topology and algorithm state rather than pixels. A renderer
turns the current grid into whatever visual representation an application
needs.

This recipe uses Canvas 2D, but the data flow is the same for SVG, WebGL, a
terminal, or a game engine.

## Drawing Walls from the Grid

Each square cell exposes its row, column, and four directional edge
references. A missing or closed edge is a wall:

```ts
import type { MazeGrid, SquareCell } from 'mazely'

function drawMaze(
  context: CanvasRenderingContext2D,
  grid: MazeGrid<SquareCell>,
  cellSize: number,
) {
  context.clearRect(
    0,
    0,
    grid.cols * cellSize,
    grid.rows * cellSize,
  )
  context.beginPath()

  for (const cell of grid.cells) {
    const x = cell.col * cellSize
    const y = cell.row * cellSize

    if (!cell.edges.top?.opened) {
      context.moveTo(x, y)
      context.lineTo(x + cellSize, y)
    }
    if (!cell.edges.right?.opened) {
      context.moveTo(x + cellSize, y)
      context.lineTo(x + cellSize, y + cellSize)
    }
    if (!cell.edges.bottom?.opened) {
      context.moveTo(x, y + cellSize)
      context.lineTo(x + cellSize, y + cellSize)
    }
    if (!cell.edges.left?.opened) {
      context.moveTo(x, y)
      context.lineTo(x, y + cellSize)
    }
  }

  context.stroke()
}
```

This approachable version can trace a shared internal wall twice. A renderer
handling very large grids can iterate `grid.edges` once and draw the outer
boundary separately.

## Drawing Visited Cells and the Final Path

Solvers write persistent visit metadata to cells:

```ts
for (const cell of maze.grid.cells) {
  if (cell.getMeta('solve.visited')) {
    fillVisitedCell(cell)
  }
}
```

After a point-to-point solver finishes, draw the ordered result path:

```ts
const result = maze.getSolveResult()

if (result?.solved) {
  drawPath(result.path)
}
```

The path uses `{ x, y }` coordinates from start to end.

## Drawing a Moving Algorithm Head

Grid state persists between frames. The most recent step provides transient
context:

```ts
const step = player.lastStep

if (step?.payload?.to) {
  drawHead(step.payload.to)
}
```

Step payloads use cell IDs. Convert them before passing coordinates to a
square-grid renderer:

```ts
import { cellIdToPoint } from 'mazely'

if (step?.payload?.to) {
  drawHead(cellIdToPoint(step.payload.to))
}
```

## Separating Renderer Responsibilities

A renderer is easier to change when each visual layer has one source:

| Layer        | Source                                             |
| ------------ | -------------------------------------------------- |
| Walls        | `grid.cells`, directional edges, and `edge.opened` |
| Solve state  | cell `solve.*` metadata and `getSolveResult()`     |
| Moving state | `player.lastStep`                                  |
| Appearance   | application-owned colors, sizes, and visibility    |
| Camera       | application-owned pan, zoom, and projection        |

With this separation, switching from Canvas to SVG or 3D does not require
changing maze generation or solving code.
