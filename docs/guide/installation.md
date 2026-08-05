---
description: Install Mazely with npm, pnpm, Yarn, or Bun, or import it directly as a native browser ES module.
---

# Installation

## Requirements

Package-manager installations require [Node.js](https://nodejs.org/) 24 or
newer. Importing Mazely directly in a browser does not require Node.js.

The package is published as an ES module and includes TypeScript declarations.

## Using a Package Manager

Install `mazely`, the recommended package for applications:

::: code-group

```sh [npm]
npm install mazely
```

```sh [pnpm]
pnpm add mazely
```

```sh [Yarn]
yarn add mazely
```

```sh [Bun]
bun add mazely
```

:::

You can now import the public factory and all lower-level helpers from the same
entry point:

```ts
import { createMaze } from 'mazely'
```

## Using Native Browser Modules

For a page without a package manager or build tool, import Mazely through an
ES module CDN:

```html
<script type="module">
  import { createMaze } from 'https://esm.sh/mazely@0.2.0'

  const maze = createMaze({ seed: 'browser-example' })
  maze.generate('dfs').finish()

  console.log(maze.grid)
</script>
```

The version is pinned so that the page does not change when a new release is
published. A package-manager setup is better suited to applications that need
TypeScript, dependency locking, or a production build.

## Verifying the Installation

Create a small maze and finish its generation:

```ts
import { createMaze } from 'mazely'

const maze = createMaze({
  grid: { type: 'square', cols: 5, rows: 5 },
  seed: 1,
})

maze.generate('dfs').finish()

console.log(maze.grid.cells.length) // 25
console.log(maze.grid.edges.filter(edge => edge.opened).length) // 24
```

A generated maze is a spanning tree. A connected grid with `n` cells therefore
has `n - 1` open internal edges.

Continue with the [Quick Start](/guide/quick-start) to generate, solve, and
read a complete maze.
