---
description: Observe Mazely playback, completion, reset, lifecycle, and editing changes through typed events and state snapshots.
---

# Events and State

Events allow an application to update controls or request a render after maze
state changes. They do not schedule animation or draw the maze.

## `maze.on()`

Registers a handler and returns an unsubscribe function:

```ts
const unsubscribe = maze.on('step', ({ state }) => {
  console.log(state.index, state.totalSteps)
})

unsubscribe()
```

```ts
interface Maze {
  on: (
    event: MazeEventName,
    handler: MazeEventHandler,
  ) => () => void
}
```

## `maze.off()`

Removes a previously registered handler:

```ts
maze.off('step', handler)
```

```ts
interface Maze {
  off: (
    event: MazeEventName,
    handler: MazeEventHandler,
  ) => void
}
```

## Event Names

| Event         | Emitted when                                                |
| ------------- | ----------------------------------------------------------- |
| `step`        | Playback moves forward or backward                          |
| `complete`    | Forward playback first reaches the end                      |
| `reset`       | The active player rewinds to index `0`                      |
| `phaseChange` | The lifecycle changes among `idle`, `generate`, and `solve` |
| `edit`        | A manual edit or solve-state clear completes                |

One `next(count)` or `prev(count)` call emits one `step` event even when it
applies or reverses multiple steps.

## Event Payload

Every maze event receives the current state:

```ts
interface MazelyEventPayload {
  state: MazelyState
}

type MazeEventHandler = (
  payload: MazelyEventPayload,
) => void
```

Read `player.lastStep` inside a handler when rendering also needs the most
recent semantic step.

## `maze.getState()`

Returns a new state snapshot:

```ts
interface MazelyState {
  phase: 'idle' | 'generate' | 'solve'
  index: number
  totalSteps: number
  done: boolean
  generationAlgorithm?: MazeGenerationAlgorithm
  solvingAlgorithm?: MazeSolvingAlgorithm
}

interface Maze {
  getState: () => MazelyState
}
```

`totalSteps` is the number currently buffered by the active player. Use
`player.progress.totalSteps` when you need to distinguish an unknown lazy
total (`null`) from an exact completed total.

## Updating a Renderer after Each Step

```ts
const player = maze.generate('prim')

const unsubscribe = maze.on('step', () => {
  render(maze.grid, player.lastStep)
})

while (player.next()) {
  // Each call emits the event after applying its step.
}

unsubscribe()
```

For browser animation, call `next()` from `requestAnimationFrame` or another
application-owned scheduler. See [Animating Algorithm Progress](/recipes/animation).
