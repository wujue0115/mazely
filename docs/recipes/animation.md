---
description: Connect Mazely StepPlayer progress to requestAnimationFrame, playback controls, and speed-independent animation.
---

# Animating Algorithm Progress

Mazely applies algorithm steps, but it does not decide when they run. This lets
an application choose its own frame rate, speed controls, pause behavior, and
renderer.

This recipe uses browser APIs. The same `StepPlayer` methods can be connected
to another scheduler in a game engine or server process.

## Advancing on Each Frame

Create a player, apply one step, render the updated grid, and schedule the next
frame:

```ts
const player = maze.generate('prim')

function frame() {
  if (!player.next()) {
    return
  }

  render(maze.grid, player.lastStep)

  if (!player.done) {
    requestAnimationFrame(frame)
  }
}

requestAnimationFrame(frame)
```

`next()` mutates the grid before `render()` runs. `lastStep` describes the most
recently applied change.

## Keeping Speed Independent from Refresh Rate

One step per frame runs faster on a 120 Hz display than on a 60 Hz display.
Convert elapsed time into a step budget when playback should have a consistent
speed:

```ts
const player = maze.generate('hunt-and-kill')
const stepsPerSecond = 240
let carriedSteps = 0
let previousTime = performance.now()

function frame(currentTime: number) {
  const elapsedSeconds = (currentTime - previousTime) / 1000
  previousTime = currentTime
  carriedSteps += elapsedSeconds * stepsPerSecond

  const stepCount = Math.floor(carriedSteps)
  if (stepCount > 0) {
    player.next(stepCount)
    carriedSteps -= stepCount
    render(maze.grid, player.lastStep)
  }

  if (!player.done) {
    requestAnimationFrame(frame)
  }
}

requestAnimationFrame(frame)
```

Calling `next(stepCount)` applies every requested step, while `lastStep`
exposes only the final one. If an overlay must process every semantic payload,
read the newly applied slice from `player.steps`.

## Adding Step, Back, and Reset Controls

Pause playback by stopping the application's scheduling loop. `StepPlayer`
does not need a separate pause state:

```ts
stepButton.addEventListener('click', () => {
  player.next()
  render(maze.grid, player.lastStep)
})

backButton.addEventListener('click', () => {
  player.prev()
  render(maze.grid, player.lastStep)
})

resetButton.addEventListener('click', () => {
  player.reset()
  render(maze.grid)
})
```

`reset()` keeps buffered steps, so replay uses the same previously generated
random choices.

## Starting Solve Playback after Generation

A solver cannot start while generation is unfinished. Wait for the generation
player to complete before creating the solver:

```ts
const generation = maze.generate('dfs')

const stopListening = maze.on('complete', ({ state }) => {
  if (state.phase !== 'generate') {
    return
  }

  stopListening()

  const solving = maze.solve('a-star', {
    start: { x: 0, y: 0 },
    end: { x: 20, y: 20 },
  })

  animate(solving)
})

animate(generation)
```

Here, `animate()` is the application-owned loop from the earlier examples.

## Drawing Temporary Algorithm State

Persistent topology lives in the grid. Step payloads are useful for temporary
overlays:

```ts
const step = player.lastStep

if (step?.type === 'hunt-scan') {
  drawScanRow(step.payload.row)
}

if (step?.type === 'solve.flood') {
  drawFloodDepth(step.payload.to, step.payload.depth)
}
```

See [Steps & Payloads](/api/steps) for the step types emitted by each built-in
algorithm.
