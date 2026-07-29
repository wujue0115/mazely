---
description: Open and close maze connections transactionally while keeping targets, solve metadata, lifecycle state, and events consistent.
---

# Editing

Use the `Maze` editing API when an application changes passages after
generation. These methods validate targets and clean up lifecycle state that
would otherwise describe an outdated topology.

## Changing One Passage

Open or close the shared edge between two adjacent cells:

```ts
maze.setEdgeOpenedBetween(
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  true,
)
```

Or address a known edge ID:

```ts
maze.setEdgeOpened(edgeId, false)
```

Both methods return `void`.

## Changing Every Edge around a Cell

```ts
maze.openCell({ x: 2, y: 2 })
maze.closeCell({ x: 3, y: 2 })
```

`openCell()` and `closeCell()` affect each edge attached to the selected active
cell. Boundary sides without an edge are unchanged.

## Changing the Entire Grid

```ts
maze.openAllEdges()
maze.closeAllEdges()
```

These methods affect every internal edge in the grid.

## Committing Multiple Changes Together

`edit()` stages a group of changes before applying them:

```ts
maze.edit((editor) => {
  editor.closeAllEdges()
  editor.setEdgeOpenedBetween(
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    true,
  )
})
```

```ts
interface MazeEditor {
  setEdgeOpened: (edgeId: string, opened: boolean) => void
  setEdgeOpenedBetween: (
    from: MazePoint,
    to: MazePoint,
    opened: boolean,
  ) => void
  openCell: (point: MazePoint) => void
  closeCell: (point: MazePoint) => void
  openAllEdges: () => void
  closeAllEdges: () => void
}
```

If target validation or the callback throws, no staged change is committed.
A successful batch emits one `edit` event.

## Lifecycle Effects

Every successful edit:

- clears `solve.*` cell metadata
- removes the active generation or solving player
- clears selected algorithm state
- returns the maze to `idle`
- emits one `edit` event

Editing is rejected after an unfinished player has applied a step. Finish that
player or call `reset()` before editing.

## Direct Edge Mutation

`MazeEdge.open()` and `MazeEdge.close()` change only the edge:

| Operation                        | Validates | Clears solve state | Resets lifecycle | Emits `edit` |
| -------------------------------- | :-------: | :----------------: | :--------------: | :----------: |
| `maze.setEdgeOpenedBetween(...)` |    Yes    |        Yes         |       Yes        |     Yes      |
| `maze.edit(...)`                 |    Yes    |        Yes         |       Yes        |     Yes      |
| `edge.open()` or `edge.close()`  |    No     |         No         |        No        |      No      |

Direct mutation is appropriate while constructing a new low-level grid or
decoder. Prefer the maze editing methods for an active application instance.

## `maze.clearSolveState()`

Removes solve metadata without changing any edge:

```ts
maze.clearSolveState()
```

It also clears the active solve player, changes a `solve` phase back to
`idle`, and emits `edit`.

## Validation Errors

Editing methods reject:

- unknown edge IDs
- points outside the grid or on an excluded mask cell
- non-adjacent point pairs
- adjacent cells without a shared edge, such as across a masked gap
