---
description: Build common Mazely application features including animation, custom rendering, shaped grids, and persistence.
---

# Recipes

The Guide explains Mazely's core model. These recipes combine multiple APIs to
solve common application problems.

Recipes assume that you can create and generate a maze. If you have not done
that yet, begin with the [Quick Start](/guide/quick-start).

## Animating Algorithm Progress

Connect `StepPlayer` to `requestAnimationFrame`, add playback controls, and
keep animation speed stable across display refresh rates.

[Build an animation loop →](/recipes/animation)

## Drawing Maze State

Read cells, edges, solve metadata, and step payloads in a Canvas renderer. The
same separation applies to SVG, WebGL, terminal, and game renderers.

[Build a custom renderer →](/recipes/custom-renderer)

## Generating a Shaped Maze

Use a boolean mask to exclude square-grid cells, validate connected shapes,
and choose valid start and end points.

[Generate a masked maze →](/recipes/masked-maze)

## Saving and Restoring a Maze

Serialize maze topology as JSON and restore it into a compatible grid without
persisting internal playback state.

[Save and restore topology →](/recipes/save-and-restore)
