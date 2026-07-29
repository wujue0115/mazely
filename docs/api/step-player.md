---
description: Run a lazy Mazely algorithm forward or backward, reset it, finish it, and inspect buffered or completed progress.
---

# StepPlayer

`StepPlayer<Step>` applies algorithm steps to a grid and tracks the current
playback position. `maze.generate()` and `maze.solve()` each return one.

Most applications do not construct `StepPlayer` directly.

## `player.steps`

```ts
declare class StepPlayer<Step> {
  readonly steps: Step[]
}
```

Contains the steps materialized from the lazy source so far. It grows as
forward playback requests new steps.

## `player.index`

```ts
declare class StepPlayer<Step> {
  readonly index: number
}
```

The number of currently applied steps. When `index` is greater than zero, the
most recently applied step is `steps[index - 1]`.

## `player.total`

```ts
declare class StepPlayer<Step> {
  readonly total: number
}
```

The number of currently buffered steps. This is not necessarily the final
total while the source remains lazy.

## `player.done`

```ts
declare class StepPlayer<Step> {
  readonly done: boolean
}
```

`true` when no step remains after the current position. Reading this property
may pull one step from the lazy source to determine whether playback can
continue.

## `player.lastStep`

```ts
declare class StepPlayer<Step> {
  readonly lastStep: Step | undefined
}
```

The most recently applied step, or `undefined` at index `0`.

## `player.progress`

```ts
interface StepPlayerProgress {
  bufferedSteps: number
  done: boolean
  index: number
  totalSteps: number | null
}

declare class StepPlayer<Step> {
  readonly progress: StepPlayerProgress
}
```

`totalSteps` is `null` until the player can determine the exact final total.
It becomes a number when playback reaches the end.

## `player.next()`

Applies up to `count` forward steps:

```ts
declare class StepPlayer<Step> {
  next(count?: number): boolean
}
```

`count` defaults to `1`. The method returns `true` when at least one step was
applied:

```ts
player.next()
player.next(10)
```

One call emits one `step` event, even when it applies multiple steps.

### Reading Every Applied Step

`lastStep` exposes only the final step from a multi-step call. Record the
starting index when an application must process every payload:

```ts
const startIndex = player.index
player.next(10)

for (const step of player.steps.slice(startIndex, player.index)) {
  consume(step)
}
```

The grid receives every patch regardless of how many payloads the renderer
reads.

## `player.prev()`

Reverses up to `count` applied steps:

```ts
declare class StepPlayer<Step> {
  prev(count?: number): boolean
}
```

It returns `true` when playback moved. Patches are reversed in reverse order,
restoring each patch's previous value.

```ts
player.prev()
player.prev(5)
```

## `player.finish()`

Applies every remaining step:

```ts
declare class StepPlayer<Step> {
  finish(): boolean
}
```

Returns `true` when playback advanced:

```ts
const generation = maze.generate('dfs')
generation.finish()
```

## `player.reset()`

Rewinds all applied steps to index `0`:

```ts
declare class StepPlayer<Step> {
  reset(): void
}
```

Buffered steps remain available, so replay does not regenerate previously
materialized random choices.

## Narrowing Step Payloads

Generation and solving steps are discriminated unions. Check `type` before
reading a specialized payload:

```ts
const step = player.lastStep

if (step?.type === 'solve.flood') {
  console.log(step.payload.to, step.payload.depth)
}
```

See [Steps and Payloads](/api/steps) for all step types, payload fields, and
built-in algorithm emissions.
