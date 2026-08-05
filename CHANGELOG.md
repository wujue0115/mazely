# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Added a previous-step control to Mazely Studio for rewinding paused Generate
  and Solve animations, including completed animations.
- Added current-view image export in Mazely Studio for PNG, JPEG, and WebP,
  including the active 2D or 3D camera, plus the existing 2D SVG vector export.

### Changed

- Mazely Studio's forward-step control now restarts a completed Solve animation
  and advances its first step.

### Fixed

- Corrected Binary Tree generation step direction, including masked mazes, so
  animation heads move from the north or west neighbor toward the current cell.

## [0.2.0] - 2026-08-05

### Added

- Added bundled `solve.process` steps for BFS, Greedy Best-First, and A\* so
  visualizers can atomically track the active node and all cells added to the
  logical frontier. DFS continues to emit `solve.expand` steps.
- Added precise multi-frontier Studio animations for BFS, Greedy Best-First,
  and A\*, matching the path, head, sub-path, and frontier visual language used
  by Prim and Random Traversal.

### Changed

- Mazely Studio now keeps an active solve visualization on the canvas when
  switching to Generate, until a generation run or step actually begins.

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
- Added Mazely Studio and the VitePress documentation site.

[Unreleased]: https://github.com/wujue0115/mazely/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/wujue0115/mazely/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/wujue0115/mazely/releases/tag/v0.1.0
