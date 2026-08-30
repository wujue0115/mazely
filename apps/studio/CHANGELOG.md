# Mazely Studio Changelog

All notable changes to the continuously deployed Mazely Studio app are
documented in this file. Studio versions advance independently from the
published `mazely` and `@mazely/core` packages.

## [Unreleased]

### Added

- Added triangular-grid generation, solving, and editing with triangular and
  rectangular outer layouts in the WebGL 2D and 3D views and SVG export.
- Added topology-aware algorithm availability driven by core capability
  metadata.
- Added image-shaped triangle mazes on rectangular outer layouts, with
  polygon-based image sampling, cell colors, editing tools, and triangle-aware
  connectivity checks.
- Added `.maze` save and load support for triangular and rectangular Triangle
  layouts, including masks, cell colors, and solve state.
- Added Binary Tree generation for Triangle grids, including masked triangular
  and rectangular layouts.
- Added Eller's generation for Triangle grids with orientation-aware cross-row
  links.
- Added Sidewinder generation for Triangle grids with orientation-aware runs.
- Added Recursive Division generation for Triangle grids using connected
  topology partitions.

### Changed

- Grid topology and Triangle layout changes now ask for confirmation before
  discarding an existing maze, applied shape, or generation progress.
- Maze download filenames now include the local save date and time.

### Fixed

- Improved large Triangle animation performance by caching wall topology,
  junction geometry, and 3D extrusion chunks while preserving live appearance
  updates.
- Allowed `.maze` files to reload triangular outer layouts up to the Studio
  size limit, including their derived logical column counts above 500.
- Preserved image shapes and their cell colors when every grid cell is kept in
  saved `.maze` files.
- Kept passage widths consistent when rendering thick triangular walls,
  including 60-degree and 120-degree junctions and terminal wall cuts.
- Matched Triangle 3D wall junctions and terminal cuts to the 2D geometry.
- Removed small protrusions where solution path segments meet on triangular
  grids by using joined path geometry.

## [0.6.1] - 2026-08-15

### Fixed

- Removed the extra top border and spacing above the Solve point readouts when
  the manual Start and End controls are shown.

## [0.6.0] - 2026-08-13

### Added

- Added independent automatic and manual point selection to the Generate and
  Solve panels, including direct 2D canvas selection for generation starts and
  solve start/end points.
- Added point-selection preference persistence to `.maze` files with backward
  compatibility for files saved by earlier Studio versions.

### Changed

- Editing a start point now updates the saved Generate and Solve manual starts,
  while editing an end point updates the saved Solve manual end without
  changing either panel's automatic/manual mode.
- Solve paths, visits, heads, frontiers, and flood colors are now shown only in
  the Solve panel.

### Fixed

- Prevented point-to-point solvers from using the same start and end cell.
- Kept the playback dock's expand button visible when the dock is collapsed.

## [0.5.0] - 2026-08-11

### Added

- Added custom flood gradients with configurable start and end colors,
  color-point counts, draggable cubic Bézier interpolation curves, live
  previews, and optional ping-pong looping without endpoint jumps.
- Added custom flood gradient persistence to `.maze` files and matching 2D,
  3D, and SVG export rendering.

### Changed

- The Appearance panel now keeps every setting visible and disables controls
  that do not apply to the active tab or algorithm.
- Updated the default custom flood gradient to `#91F7FF` → `#264054` and the
  default path color to `#91F7FF`.

## [0.4.1] - 2026-08-06

### Fixed

- Refined the image export dialog's spacing and visual hierarchy.

## [0.4.0] - 2026-08-06

### Added

- Added current-view image export for PNG, JPEG, and WebP, including the active
  2D or 3D camera, plus the existing 2D SVG vector export.

## [0.3.0] - 2026-08-05

### Added

- Added a previous-step control for rewinding paused Generate and Solve
  animations, including completed animations.

### Changed

- The forward-step control now restarts a completed Generate or Solve animation
  and advances its first step.

## [0.2.0] - 2026-08-05

### Added

- Added precise multi-frontier animations for BFS, Greedy Best-First, and A\*,
  matching the path, head, sub-path, and frontier visual language used by Prim
  and Random Traversal.

### Changed

- Active solve visualizations now remain on the canvas when switching to
  Generate until a generation run or step begins.

## [0.1.1] - 2026-08-04

### Fixed

- Rebuilt WebGL 2D walls when a same-sized maze runtime replaces the current
  maze.
- Corrected the mobile header layout and displayed Studio's independent app
  version.

## [0.1.0] - 2026-07-29

### Added

- Added the initial Mazely Studio app for generating, solving, editing,
  visualizing, saving, and exporting mazes.
