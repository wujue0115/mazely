---
description: Understand Mazely generation and solving steps, grid patches, and optional semantic context for application renderers.
---

# Steps & Payloads

Generation and solving algorithms yield discriminated step objects. A renderer
can use their payloads for temporary progress, while `StepPlayer` uses their
patches to update and rewind persistent grid state.

## `MazeStep`

A step combines a semantic type, reversible patches, and optional context:

```ts
interface MazeStep<
  Type extends string = string,
  Payload extends MazeStepPayload = MazeStepPayload,
> {
  type: Type
  patches: MazePatch[]
  payload?: Payload
}
```

Use `type` and `payload` to drive transient visualization. Treat the applied
grid and cell metadata as the source of truth for persistent state.

## Cell IDs in Payloads

`from` and `to` are topology-neutral `CellId` values, not `{ x, y }` points.
For the built-in square grid, convert them explicitly:

```ts
import { cellIdToPoint } from 'mazely'

const step = player.lastStep
if (step?.payload?.to) {
  const point = cellIdToPoint(step.payload.to)
}
```

`from` is absent or `null` when a step has no predecessor, such as the first
visited cell.

```ts
interface MazeCellTransitionPayload {
  from?: CellId | null
  to: CellId
}

interface MazeEdgeCollectionPayload {
  edges: string[]
}

interface MazeHuntScanPayload {
  row: number
}

interface MazeFloodPayload extends MazeCellTransitionPayload {
  depth: number
}
```

## Generation Steps

```ts
type MazeGenerationStep
  = | MazePayloadStep<'carve', MazeCellTransitionPayload>
    | MazePayloadStep<
      'close' | 'open' | 'generation.normalize.close',
      MazeEdgeCollectionPayload
    >
    | MazePayloadStep<'hunt-scan', MazeHuntScanPayload>
    | MazePayloadStep<'visit', MazeCellTransitionPayload>
```

| Type                         | Payload         | Meaning                                                  |
| ---------------------------- | --------------- | -------------------------------------------------------- |
| `visit`                      | `{ from?, to }` | Reports a generation cursor visit without carving        |
| `carve`                      | `{ from, to }`  | Opens the edge from the generated region to another cell |
| `close`                      | `{ edges }`     | Closes one or more edge IDs                              |
| `open`                       | `{ edges }`     | Opens one or more edge IDs                               |
| `hunt-scan`                  | `{ row }`       | Reports a Hunt-and-Kill scan row                         |
| `generation.normalize.close` | `{ edges }`     | Removes an open edge while normalizing a spanning tree   |

Aldous-Broder uses patchless `visit` steps for its initial cursor position and
for moves into previously visited cells. Reading `payload.to` on every step
animates the complete random walk; only `carve` changes the maze topology.

`open` is part of the public generation-step union for algorithms that batch
edge opening. No current built-in generator emits it directly.

Every generator selected through `maze.generate()` is wrapped with a
spanning-tree guarantee. The wrapper can append `carve` or
`generation.normalize.close` steps when it repairs disconnected components or
cycles.

### Built-in Generation Emissions

| Algorithm            | Primary step types   |
| -------------------- | -------------------- |
| `aldous-broder`      | `visit`, `carve`     |
| `binary-tree`        | `carve`              |
| `dfs`                | `visit`, `carve`     |
| `eller`              | `carve`              |
| `growing-tree`       | `carve`              |
| `hunt-and-kill`      | `carve`, `hunt-scan` |
| `kruskal`            | `carve`              |
| `prim`               | `carve`              |
| `recursive-division` | `close`              |
| `sidewinder`         | `carve`              |
| `traversal`          | `carve`              |
| `wilson`             | `carve`              |

The normalization wrapper may add the repair steps described above to any
row.

## Solving Steps

```ts
type MazeSolvingStep
  = | MazePayloadStep<'solve.visit', MazeCellTransitionPayload>
    | MazePayloadStep<'solve.expand', MazeCellTransitionPayload>
    | MazePayloadStep<'solve.flood', MazeFloodPayload>
```

| Type           | Payload                | Meaning                                            |
| -------------- | ---------------------- | -------------------------------------------------- |
| `solve.visit`  | `{ to }`               | Marks the initial point-to-point solver cell       |
| `solve.expand` | `{ from, to }`         | Discovers `to` from `from` and records its parent  |
| `solve.flood`  | `{ from?, to, depth }` | Visits one flood cell with its breadth-first depth |

A\*, Best-First, BFS, and DFS emit `solve.visit` followed by zero or more
`solve.expand` steps. Flood emits only `solve.flood`.

You can fold the transition payloads into application-owned visual state:

```ts
const parentById = new Map<string, string | null>()
const visited = new Set<string>()

function consume(step: MazeSolvingStep) {
  const { from = null, to } = step.payload
  visited.add(to)
  parentById.set(to, from)

  if (step.type === 'solve.flood') {
    colorByDepth(to, step.payload.depth)
  }
}
```

## Patches

Steps currently use two patch variants:

```ts
type MazePatch
  = | {
    type: 'setCellMeta'
    cellId: CellId
    key: string
    from: unknown
    to: unknown
  }
  | {
    type: 'setEdgeOpened'
    edgeId: string
    from: boolean
    to: boolean
  }
```

Moving forward applies `to`. Moving backward applies `from`, processing a
step's patches in reverse order. A `setCellMeta` patch with an
`undefined` target removes the metadata key.

Renderers normally should not apply patches themselves; `StepPlayer` already
does that before exposing the newly applied step.
