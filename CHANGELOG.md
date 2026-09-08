# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added regular Hex grids with rectangular and hexagonal outer layouts,
  pointy/flat orientation, masks, `HexCell`, `HexGrid`, and `createHexGrid()`.
- Added Hex support to all built-in generation algorithms, axial A* distance,
  JSON grid serialization, and the public package exports.

### Fixed

- Kept Hex generation, solving, rendering, and shape bounds stable for large
  layouts by using topology-aware coordinates instead of expanded point lists.

## [0.4.0] - 2026-08-31

### Added

- Added triangular grids with triangular and rectangular outer layouts,
  optional masks, `TriangleCell`, `TriangleGrid`, and `createTriangleGrid()`.
- Added triangle-aware generation and solving across topology-neutral grid
  traversal, editing, and public package exports.
- Added grid type, triangle layout, and triangle side-size metadata to compact
  grid serialization while retaining compatibility with older square data.

### Changed

- Added `supportedGridTypes` to generation algorithm capabilities. Triangle
  grids support Aldous-Broder, Binary Tree, DFS, Eller's, Growing Tree,
  Hunt-and-Kill, Kruskal, Prim, Random Traversal, Recursive Division,
  Sidewinder, and Wilson generation.

### Fixed

- Matched Studio SVG exports to the 2D view, including the selected wall
  thickness, Triangle junction and terminal geometry, grid lines, cell colors,
  and active generation or solving overlays.
- Defined the initial `.maze` 1.0 schemas for topology, links, state, style,
  metadata, and cell colors. Links and paths now use canonical topology cell
  slots instead of runtime edge-array order or Square-only directions.

## [0.3.0] - 2026-08-06

### Fixed

- Corrected Binary Tree generation step direction, including masked mazes, so
  animation heads move from the north or west neighbor toward the current cell.

## [0.2.0] - 2026-08-05

### Added

- Added bundled `solve.process` steps for BFS, Greedy Best-First, and A\* so
  visualizers can atomically track the active node and all cells added to the
  logical frontier. DFS continues to emit `solve.expand` steps.

## [0.1.0] - 2026-07-31

### Added

- Added twelve deterministic maze generation algorithms and five solving or
  traversal algorithms.
- Added a shared algorithm execution API for incremental progress or immediate
  completion.
- Added square grids, custom masks, transactional editing, events, and compact
  grid serialization.
- Added the high-level `mazely` package and lower-level `@mazely/core` package
  with ESM output and TypeScript declarations.
- Added the VitePress documentation site.

[Unreleased]: https://github.com/wujue0115/mazely/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/wujue0115/mazely/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/wujue0115/mazely/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/wujue0115/mazely/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/wujue0115/mazely/releases/tag/v0.1.0
