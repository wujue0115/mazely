import type { Maze } from 'mazely'
import type { GenerationPreview } from './controllers/generation'
import type { MazePoint, MazeViewState } from './maze-types'
import type { ThreeMazeView, ThreeOverlayDot, ThreeOverlaySegment } from './three-view'
import type { Webgl2dMazeView, Webgl2dOverlayDot, Webgl2dOverlayRing, Webgl2dOverlaySegment } from './webgl-2d-view'
import {
  getGenerationAlgorithm,
  getPointMarkerVisibility,
  isGenerationVisibleMultiHeadMode,
  shouldShowFloodVisualization,
  shouldShowGenerationTrail,
  shouldShowSolveProgress,
} from './algorithms'
import { app } from './app-state'
import { getHuntScanSegment, shouldRenderGenerationPreview } from './controllers/generation'
import { maybeSyncUi, syncUi } from './controllers/status'
import {
  getGenerationActiveSegmentPoints,
  getGenerationFrontierHeads,
  getGenerationFrontierTrailEdges,
  getGenerationKruskalHeads,
  getGenerationTrailPoints,
  getPathSet,
  getShapeCellColor,
  getSolveFrontierHeads,
  getSolveFrontierTrailEdges,
  getSolveTrailPoints,
  isSolveMultiHeadMode,
} from './derived'
import { canvasWrap, ctx, generationSelect } from './dom'
import { getFloodDepthColor } from './flood'
import { key, parsePointKey } from './point'
import { hasOpenCellEdge } from './runtime'
import { FIXED_CELL_SIZE, ZOOM_MAX, ZOOM_MIN } from './types'
import { clamp } from './utils'

const FOCUS_VIEW_SCALE = 0.75
const FOCUS_ZOOM_MIN = 0.001
const LOW_DETAIL_CELL_SCREEN_SIZE = 3
const LOW_DETAIL_CELL_COUNT = 40000
const HIDDEN_CELL_COLOR = '#111317'
const EMPTY_KEY_SET = new Set<string>()

function getViewportSize(): { width: number, height: number } {
  const rect = canvasWrap.getBoundingClientRect()
  return { height: rect.height, width: rect.width }
}

function isOpenFieldGenerationPreview(preview: GenerationPreview | null): boolean {
  return preview?.algorithm === 'recursive-division'
}

function shouldShowSolveResult(previewingGeneration: boolean): boolean {
  return !previewingGeneration && app.stepState.status !== 'running'
}

export function resetView(): void {
  if (app.view3d) {
    app.threeView?.resetCamera()
    render()
    return
  }

  fitMazeInView(getActiveMazeView())
  render()
}

export function getZoomBounds(targetMaze: MazeViewState = getActiveMazeView()): { min: number, max: number, fit: number } {
  const { height, width } = getViewportSize()
  if (width <= 0 || height <= 0) {
    return { fit: 1, max: ZOOM_MAX, min: ZOOM_MIN }
  }

  const rows = targetMaze.rows
  const cols = targetMaze.cols
  if (rows <= 0 || cols <= 0) {
    return { fit: 1, max: ZOOM_MAX, min: ZOOM_MIN }
  }

  const mazePixelWidth = cols * FIXED_CELL_SIZE
  const mazePixelHeight = rows * FIXED_CELL_SIZE
  const rawFitZoom = Math.min(width / mazePixelWidth, height / mazePixelHeight)
  const fitZoom = clamp(rawFitZoom * FOCUS_VIEW_SCALE, FOCUS_ZOOM_MIN, ZOOM_MAX)

  return {
    fit: fitZoom,
    max: ZOOM_MAX,
    min: Math.min(ZOOM_MIN, fitZoom),
  }
}

export function fitMazeInView(targetMaze: MazeViewState): void {
  const { height, width } = getViewportSize()
  if (width <= 0 || height <= 0) {
    return
  }

  const { fit } = getZoomBounds(targetMaze)

  app.zoom = fit
  app.panX = ((1 - app.zoom) * width) / 2
  app.panY = ((1 - app.zoom) * height) / 2
}

function getActiveMazeView(): MazeViewState {
  return app.activeTab === 'generate' && app.generationPreview
    ? app.generationPreview.view
    : app.maze
}

// three.js is loaded on demand so the 2D-only experience stays lightweight.
export function ensureThreeView(): Promise<ThreeMazeView> {
  app.threeViewPromise ??= import('./three-view').then(({ ThreeMazeView }) => {
    app.threeView = new ThreeMazeView(canvasWrap)
    return app.threeView
  })
  return app.threeViewPromise
}

export function ensureWebgl2dView(): Promise<Webgl2dMazeView> {
  app.webgl2dViewPromise ??= import('./webgl-2d-view').then(({ Webgl2dMazeView }) => {
    app.webgl2dView = new Webgl2dMazeView(canvasWrap)
    return app.webgl2dView
  })
  return app.webgl2dViewPromise
}

export function render(): void {
  const { height, width } = getViewportSize()

  ctx.clearRect(0, 0, width, height)

  if (!app.hasValidGridDimensions) {
    syncUi()
    return
  }

  const generationPreview = app.activeTab === 'generate' ? app.generationPreview : null
  const preview = generationPreview && shouldRenderGenerationPreview(generationPreview)
    ? generationPreview
    : null
  const previewingGeneration = preview !== null
  const activeMaze = preview ? preview.view : app.maze
  const activeRuntime = preview ? preview.runtime : app.mazeRuntime

  if (!activeRuntime) {
    syncUi()
    return
  }

  const { cols: colCount, rows: rowCount } = activeRuntime.grid

  if (rowCount === 0 || colCount === 0) {
    syncUi()
    return
  }

  const cellSize = FIXED_CELL_SIZE
  const cellScreenSize = cellSize * app.zoom
  const lowDetail = cellScreenSize < LOW_DETAIL_CELL_SCREEN_SIZE
    || (rowCount * colCount >= LOW_DETAIL_CELL_COUNT && cellScreenSize < 8)

  const pathSet = previewingGeneration ? EMPTY_KEY_SET : getPathSet()

  if (app.view3d) {
    app.webgl2dView?.setVisible(false)
    if (app.threeView) {
      renderThreeView(activeRuntime, preview, activeMaze, pathSet)
    }
    maybeSyncUi()
    return
  }

  app.threeView?.setVisible(false)
  if (app.webgl2dView) {
    renderWebgl2dView(activeRuntime, preview, activeMaze, pathSet, lowDetail, width, height)
  }
  else {
    void ensureWebgl2dView().then((view) => {
      view.setVisible(!app.view3d)
      render()
    })
  }
  maybeSyncUi()
}

// 2D line widths are cellSize * 0.14 / 0.18; one world unit is one cell.
const THREE_TRAIL_WIDTH = 0.14
const THREE_PATH_WIDTH = 0.18
const THREE_HEAD_RADIUS = 0.22
const HUNT_SCAN_WIDTH = 0.12
const EDIT_HINT_BORDER_WIDTH = 0.035
const EDIT_HINT_COLOR = '#dffaff'
const EDIT_POINT_PREVIEW_RADIUS = 0.36

function renderWebgl2dView(
  activeRuntime: Maze,
  preview: GenerationPreview | null,
  activeMaze: MazeViewState,
  pathSet: Set<string>,
  lowDetail: boolean,
  viewportWidth: number,
  viewportHeight: number,
): void {
  if (!app.webgl2dView) {
    return
  }

  app.webgl2dView.setVisible(true)
  const previewing = preview !== null
  const floodActive = shouldShowFloodVisualization({
    activeTab: app.activeTab,
    previewingGeneration: previewing,
    solvingAlgorithm: app.stepState.algorithm,
    solveStarted: app.stepState.visitedCount > 0,
    solveStatus: app.stepState.status,
  })
  const solveProgressVisible = shouldShowSolveProgress({
    activeTab: app.activeTab,
    previewingGeneration: previewing,
    solveStarted: app.stepState.visitedCount > 0,
    solveStatus: app.stepState.status,
  })
  const showingSolveResult = shouldShowSolveResult(previewing)
  const openFieldPreview = isOpenFieldGenerationPreview(preview)
  const getCellColor = (x: number, y: number): string => {
    if (previewing) {
      if (openFieldPreview) {
        return app.visibleElements.cell
          ? (getShapeCellColor(x, y) ?? app.styleTheme.cell)
          : HIDDEN_CELL_COLOR
      }
      if (!hasOpenCellEdge(activeRuntime, x, y)) {
        return app.visibleElements.unlinkedCell ? app.styleTheme.unlinkedCell : HIDDEN_CELL_COLOR
      }
      return app.visibleElements.visit
        ? (getShapeCellColor(x, y) ?? app.styleTheme.visit)
        : HIDDEN_CELL_COLOR
    }
    return getCellFill(activeRuntime, x, y, key(x, y), pathSet, floodActive)
  }

  const segments: Webgl2dOverlaySegment[] = []
  const dots: Webgl2dOverlayDot[] = []
  const rings: Webgl2dOverlayRing[] = []
  const hintSegments: Webgl2dOverlaySegment[] = []
  const hintBorderSegments: Webgl2dOverlaySegment[] = []
  const hintDots: Webgl2dOverlayDot[] = []
  const hintRings: Webgl2dOverlayRing[] = []
  const pushPolyline = (points: MazePoint[], color: string, width: number): void => {
    for (let index = 0; index < points.length - 1; index += 1) {
      segments.push({ color, from: points[index], to: points[index + 1], width })
    }
  }

  if (preview) {
    const huntScanSegment = getHuntScanSegment(preview)
    if (huntScanSegment && app.visibleElements.head) {
      segments.push({
        color: app.styleTheme.head,
        ...huntScanSegment,
        width: HUNT_SCAN_WIDTH,
      })
    }
    if (preview.algorithm === 'kruskal') {
      const kruskalHeads = getGenerationKruskalHeads()
      if (app.visibleElements.path) {
        pushPolyline(kruskalHeads, app.styleTheme.path, THREE_TRAIL_WIDTH)
      }
      if (app.visibleElements.head) {
        for (const point of kruskalHeads) {
          dots.push({ color: app.styleTheme.head, point, radius: THREE_HEAD_RADIUS })
        }
      }
    }
    else if (isGenerationVisibleMultiHeadMode(preview.algorithm)) {
      const activeSegmentPoints = getGenerationActiveSegmentPoints()
      const currentTrailKeys = new Set(activeSegmentPoints.map(point => key(point.x, point.y)))
      const otherFrontierHeads = preview.currentHeadKey
        ? getGenerationFrontierHeads().filter((point) => {
            const pointKey = key(point.x, point.y)
            return pointKey !== preview.currentHeadKey && !currentTrailKeys.has(pointKey)
          })
        : getGenerationFrontierHeads()

      if (app.visibleElements.subPath) {
        for (const edgeKey of getGenerationFrontierTrailEdges()) {
          const [left, right] = edgeKey.split('>')
          if (left && right) {
            segments.push({
              color: app.styleTheme.subPath,
              from: parsePointKey(left),
              to: parsePointKey(right),
              width: THREE_TRAIL_WIDTH,
            })
          }
        }
      }
      if (app.visibleElements.frontier) {
        for (const point of otherFrontierHeads) {
          dots.push({ color: app.styleTheme.frontier, point, radius: THREE_HEAD_RADIUS })
        }
      }
      if (app.visibleElements.path) {
        pushPolyline(activeSegmentPoints, app.styleTheme.path, THREE_TRAIL_WIDTH)
      }
      if (app.visibleElements.head && preview.currentHeadKey) {
        dots.push({ color: app.styleTheme.head, point: parsePointKey(preview.currentHeadKey), radius: THREE_HEAD_RADIUS })
      }
    }
    else {
      if (app.visibleElements.path && shouldShowGenerationTrail(preview.algorithm)) {
        pushPolyline(getGenerationTrailPoints(), app.styleTheme.path, THREE_TRAIL_WIDTH)
      }
      if (app.visibleElements.head && preview.currentHeadKey) {
        dots.push({ color: app.styleTheme.head, point: parsePointKey(preview.currentHeadKey), radius: THREE_HEAD_RADIUS })
      }
    }
  }

  if (!previewing && !floodActive) {
    if (app.visibleElements.path) {
      pushPolyline(app.stepState.path, app.styleTheme.path, THREE_PATH_WIDTH)
    }
    if (solveProgressVisible) {
      if (isSolveMultiHeadMode()) {
        const activeTrail = getSolveTrailPoints()
        const activeTrailKeys = new Set(activeTrail.map(point => key(point.x, point.y)))
        const frontierHeads = getSolveFrontierHeads()
          .filter(point => !activeTrailKeys.has(key(point.x, point.y)))
        if (app.visibleElements.subPath) {
          for (const edgeKey of getSolveFrontierTrailEdges(frontierHeads)) {
            const [left, right] = edgeKey.split('>')
            if (left && right) {
              segments.push({
                color: app.styleTheme.subPath,
                from: parsePointKey(left),
                to: parsePointKey(right),
                width: THREE_TRAIL_WIDTH,
              })
            }
          }
        }
        if (app.visibleElements.frontier) {
          for (const point of frontierHeads) {
            dots.push({ color: app.styleTheme.frontier, point, radius: THREE_HEAD_RADIUS })
          }
        }
        if (app.visibleElements.path) {
          pushPolyline(activeTrail, app.styleTheme.path, THREE_TRAIL_WIDTH)
        }
        if (app.visibleElements.head && app.solveCurrentHeadKey) {
          dots.push({ color: app.styleTheme.head, point: parsePointKey(app.solveCurrentHeadKey), radius: THREE_HEAD_RADIUS })
        }
      }
      else {
        if (app.visibleElements.path) {
          pushPolyline(getSolveTrailPoints(), app.styleTheme.path, THREE_TRAIL_WIDTH)
        }
        if (app.visibleElements.head && app.solveCurrentHeadKey) {
          dots.push({ color: app.styleTheme.head, point: parsePointKey(app.solveCurrentHeadKey), radius: THREE_HEAD_RADIUS })
        }
      }
    }
  }
  pushEditPreviewOverlays({
    borderSegments: hintBorderSegments,
    dots: hintDots,
    rings: hintRings,
    segments: hintSegments,
  }, clamp(app.wallThickness / FIXED_CELL_SIZE, 0.04, 0.4))

  const floodStarted = floodActive && (app.running || app.stepState.visitedCount > 0)
  const pointMarkers = getPointMarkerVisibility({
    activeTab: solveProgressVisible ? 'solve' : app.activeTab,
    floodActive,
    floodStarted,
    generationAlgorithm: getGenerationAlgorithm(generationSelect.value),
    lowDetail,
    previewingGeneration: previewing,
    showingSolveResult,
    visibleEnd: app.visibleElements.end,
    visibleStart: app.visibleElements.start,
  })

  app.webgl2dView.sync({
    cellKey: getWebgl2dCellKey(activeRuntime, previewing),
    dots,
    end: pointMarkers.end ? activeMaze.end : null,
    endColor: app.styleTheme.end,
    getCellColor,
    gridColor: app.styleTheme.grid,
    gridVisible: app.visibleElements.grid,
    gridWidth: clamp(app.wallThickness / FIXED_CELL_SIZE, 0.04, 0.4),
    hintBorderSegments,
    hintDots,
    hintRings,
    hintSegments,
    overlayKey: getWebgl2dOverlayKey(activeRuntime, previewing),
    panX: app.panX,
    panY: app.panY,
    runtime: activeRuntime,
    rings,
    segments,
    start: pointMarkers.start ? activeMaze.start : null,
    startColor: app.styleTheme.start,
    viewportHeight,
    viewportWidth,
    wallColor: app.styleTheme.wall,
    wallRevision: app.mazeEditVersion,
    wallsVisible: app.visibleElements.wall,
    wallThickness: clamp(app.wallThickness / FIXED_CELL_SIZE, 0.04, 0.4),
    zoom: app.zoom,
  })
}

function getWebgl2dCellKey(activeRuntime: Maze, previewing: boolean): string {
  const state = activeRuntime.getState()
  return [
    state.phase,
    state.index,
    state.done,
    state.generationAlgorithm,
    app.activeTab,
    previewing ? 'preview' : 'maze',
    app.mazeEditVersion,
    app.hasGeneratedMaze,
    app.stepState.status,
    app.stepState.visitedCount,
    app.stepState.path.length,
    app.stepState.algorithm,
    app.solvePlayer?.index,
    app.floodTheme,
    app.showShapeColors,
    app.shape ? 'shape' : 'rect',
    app.styleTheme.wall,
    app.styleTheme.cell,
    app.styleTheme.unlinkedCell,
    app.styleTheme.visit,
    app.visibleElements.wall,
    app.visibleElements.cell,
    app.visibleElements.unlinkedCell,
    app.visibleElements.visit,
  ].join('|')
}

function getWebgl2dOverlayKey(activeRuntime: Maze, previewing: boolean): string {
  const state = activeRuntime.getState()
  return [
    state.phase,
    state.index,
    state.done,
    app.activeTab,
    previewing ? `generation:${app.generationCacheVersion}` : 'maze',
    app.stepState.status,
    app.stepState.path.length,
    app.stepState.algorithm,
    app.solveCurrentHeadKey,
    app.visibleElements.path,
    app.visibleElements.head,
    app.visibleElements.frontier,
    app.visibleElements.start,
    app.visibleElements.end,
    app.visibleElements.subPath,
    app.editTool,
    getEditHoverTargetKey(),
    app.wallThickness,
    app.styleTheme.path,
    app.styleTheme.subPath,
    app.styleTheme.head,
    app.styleTheme.frontier,
    app.styleTheme.start,
    app.styleTheme.end,
  ].join('|')
}

function pushEditPreviewOverlays(out: {
  segments: Webgl2dOverlaySegment[]
  borderSegments: Webgl2dOverlaySegment[]
  dots: Webgl2dOverlayDot[]
  rings: Webgl2dOverlayRing[]
}, wallThickness: number): void {
  if (app.activeTab !== 'edit' || !app.editHoverTarget) {
    return
  }

  if (app.editHoverTarget.type === 'cell') {
    const color = getPointPreviewColor()
    out.dots.push({
      color,
      point: app.editHoverTarget,
      radius: EDIT_POINT_PREVIEW_RADIUS,
    })
    out.rings.push({
      color: getPointPreviewColor(),
      point: app.editHoverTarget,
      radius: EDIT_POINT_PREVIEW_RADIUS,
    })
    return
  }

  const segment = getEdgeOutlineSegment(app.editHoverTarget.from, app.editHoverTarget.to)
  out.segments.push({
    color: EDIT_HINT_COLOR,
    ...getInsetEdgeFillSegment(segment, wallThickness),
    width: wallThickness,
  })
  pushEdgeBorderSegments(out.borderSegments, segment, wallThickness)
}

function getPointPreviewColor(): string {
  if (app.editTool === 'start') {
    return app.styleTheme.start
  }
  if (app.editTool === 'end') {
    return app.styleTheme.end
  }
  return EDIT_HINT_COLOR
}

function getEdgeOutlineSegment(
  from: MazePoint,
  to: MazePoint,
): { from: MazePoint, to: MazePoint } {
  if (from.y === to.y) {
    const boundaryX = Math.max(from.x, to.x) - 0.5
    const y = from.y
    return {
      from: { x: boundaryX, y: y - 0.5 },
      to: { x: boundaryX, y: y + 0.5 },
    }
  }

  const x = from.x
  const boundaryY = Math.max(from.y, to.y) - 0.5
  return {
    from: { x: x - 0.5, y: boundaryY },
    to: { x: x + 0.5, y: boundaryY },
  }
}

function pushEdgeBorderSegments(
  segments: Webgl2dOverlaySegment[],
  line: { from: MazePoint, to: MazePoint },
  wallThickness: number,
): void {
  const halfBorder = Math.min(EDIT_HINT_BORDER_WIDTH / 2, wallThickness / 2)
  const borderCenter = Math.max(0, wallThickness / 2 - halfBorder)
  const color = EDIT_HINT_COLOR
  if (line.from.x === line.to.x) {
    const x = line.from.x
    const top = Math.min(line.from.y, line.to.y)
    const bottom = Math.max(line.from.y, line.to.y)
    segments.push(
      { color, from: { x: x - borderCenter, y: top + halfBorder }, to: { x: x - borderCenter, y: bottom - halfBorder }, width: EDIT_HINT_BORDER_WIDTH },
      { color, from: { x: x + borderCenter, y: top + halfBorder }, to: { x: x + borderCenter, y: bottom - halfBorder }, width: EDIT_HINT_BORDER_WIDTH },
      { color, from: { x: x - borderCenter, y: top }, to: { x: x + borderCenter, y: top }, width: EDIT_HINT_BORDER_WIDTH },
      { color, from: { x: x - borderCenter, y: bottom }, to: { x: x + borderCenter, y: bottom }, width: EDIT_HINT_BORDER_WIDTH },
    )
    return
  }

  const y = line.from.y
  const left = Math.min(line.from.x, line.to.x)
  const right = Math.max(line.from.x, line.to.x)
  segments.push(
    { color, from: { x: left + halfBorder, y: y - borderCenter }, to: { x: right - halfBorder, y: y - borderCenter }, width: EDIT_HINT_BORDER_WIDTH },
    { color, from: { x: left + halfBorder, y: y + borderCenter }, to: { x: right - halfBorder, y: y + borderCenter }, width: EDIT_HINT_BORDER_WIDTH },
    { color, from: { x: left, y: y - borderCenter }, to: { x: left, y: y + borderCenter }, width: EDIT_HINT_BORDER_WIDTH },
    { color, from: { x: right, y: y - borderCenter }, to: { x: right, y: y + borderCenter }, width: EDIT_HINT_BORDER_WIDTH },
  )
}

function getInsetEdgeFillSegment(
  line: { from: MazePoint, to: MazePoint },
  wallThickness: number,
): { from: MazePoint, to: MazePoint } {
  const inset = wallThickness / 2
  if (line.from.x === line.to.x) {
    const top = Math.min(line.from.y, line.to.y)
    const bottom = Math.max(line.from.y, line.to.y)
    return {
      from: { x: line.from.x, y: top + inset },
      to: { x: line.to.x, y: bottom - inset },
    }
  }

  const left = Math.min(line.from.x, line.to.x)
  const right = Math.max(line.from.x, line.to.x)
  return {
    from: { x: left + inset, y: line.from.y },
    to: { x: right - inset, y: line.to.y },
  }
}

function getEditHoverTargetKey(): string {
  const target = app.editHoverTarget
  if (!target) {
    return ''
  }
  if (target.type === 'cell') {
    return `cell:${target.x}:${target.y}`
  }
  return `edge:${target.from.x}:${target.from.y}:${target.to.x}:${target.to.y}`
}

function renderThreeView(
  activeRuntime: Maze,
  preview: GenerationPreview | null,
  activeMaze: MazeViewState,
  pathSet: Set<string>,
): void {
  if (!app.threeView) {
    return
  }

  const previewing = preview !== null
  const floodActive = shouldShowFloodVisualization({
    activeTab: app.activeTab,
    previewingGeneration: previewing,
    solvingAlgorithm: app.stepState.algorithm,
    solveStarted: app.stepState.visitedCount > 0,
    solveStatus: app.stepState.status,
  })
  const solveProgressVisible = shouldShowSolveProgress({
    activeTab: app.activeTab,
    previewingGeneration: previewing,
    solveStarted: app.stepState.visitedCount > 0,
    solveStatus: app.stepState.status,
  })
  const showingSolveResult = shouldShowSolveResult(previewing)
  const openFieldPreview = isOpenFieldGenerationPreview(preview)
  // Cell fills share the 2D logic so both views stay in lockstep: the solve
  // path shows as visit/cell fills with a line overlay, never filled cells.
  const getCellColor = (x: number, y: number): string => {
    if (previewing) {
      if (openFieldPreview) {
        return app.visibleElements.cell
          ? (getShapeCellColor(x, y) ?? app.styleTheme.cell)
          : HIDDEN_CELL_COLOR
      }
      if (!hasOpenCellEdge(activeRuntime, x, y)) {
        return app.visibleElements.unlinkedCell ? app.styleTheme.unlinkedCell : HIDDEN_CELL_COLOR
      }
      return app.visibleElements.visit
        ? (getShapeCellColor(x, y) ?? app.styleTheme.visit)
        : HIDDEN_CELL_COLOR
    }
    return getCellFill(activeRuntime, x, y, key(x, y), pathSet, floodActive)
  }

  const segments: ThreeOverlaySegment[] = []
  const dots: ThreeOverlayDot[] = []

  const pushPolyline = (points: MazePoint[], color: string, width: number): void => {
    for (let index = 0; index < points.length - 1; index += 1) {
      segments.push({ color, from: points[index], to: points[index + 1], width })
    }
  }

  if (preview) {
    const huntScanSegment = getHuntScanSegment(preview)
    if (huntScanSegment && app.visibleElements.head) {
      segments.push({
        color: app.styleTheme.head,
        ...huntScanSegment,
        width: HUNT_SCAN_WIDTH,
      })
    }
    if (preview.algorithm === 'kruskal') {
      const kruskalHeads = getGenerationKruskalHeads()
      if (app.visibleElements.path) {
        pushPolyline(kruskalHeads, app.styleTheme.path, THREE_TRAIL_WIDTH)
      }
      if (app.visibleElements.head) {
        for (const point of kruskalHeads) {
          dots.push({ color: app.styleTheme.head, point, radius: THREE_HEAD_RADIUS })
        }
      }
    }
    else if (isGenerationVisibleMultiHeadMode(preview.algorithm)) {
      const activeSegmentPoints = getGenerationActiveSegmentPoints()
      const currentTrailKeys = new Set(activeSegmentPoints.map(point => key(point.x, point.y)))
      const otherFrontierHeads = preview.currentHeadKey
        ? getGenerationFrontierHeads().filter((point) => {
            const pointKey = key(point.x, point.y)
            return pointKey !== preview.currentHeadKey && !currentTrailKeys.has(pointKey)
          })
        : getGenerationFrontierHeads()

      if (app.visibleElements.subPath) {
        for (const edgeKey of getGenerationFrontierTrailEdges()) {
          const [left, right] = edgeKey.split('>')
          if (left && right) {
            segments.push({
              color: app.styleTheme.subPath,
              from: parsePointKey(left),
              to: parsePointKey(right),
              width: THREE_TRAIL_WIDTH,
            })
          }
        }
      }
      if (app.visibleElements.frontier) {
        for (const point of otherFrontierHeads) {
          dots.push({ color: app.styleTheme.frontier, point, radius: THREE_HEAD_RADIUS })
        }
      }
      if (app.visibleElements.path) {
        pushPolyline(activeSegmentPoints, app.styleTheme.path, THREE_TRAIL_WIDTH)
      }
      if (app.visibleElements.head && preview.currentHeadKey) {
        dots.push({ color: app.styleTheme.head, point: parsePointKey(preview.currentHeadKey), radius: THREE_HEAD_RADIUS })
      }
    }
    else {
      if (app.visibleElements.path && shouldShowGenerationTrail(preview.algorithm)) {
        pushPolyline(getGenerationTrailPoints(), app.styleTheme.path, THREE_TRAIL_WIDTH)
      }
      if (app.visibleElements.head && preview.currentHeadKey) {
        dots.push({ color: app.styleTheme.head, point: parsePointKey(preview.currentHeadKey), radius: THREE_HEAD_RADIUS })
      }
    }
  }

  if (!previewing && !floodActive) {
    if (app.visibleElements.path) {
      pushPolyline(app.stepState.path, app.styleTheme.path, THREE_PATH_WIDTH)
    }

    if (solveProgressVisible) {
      if (isSolveMultiHeadMode()) {
        const activeTrail = getSolveTrailPoints()
        const activeTrailKeys = new Set(activeTrail.map(point => key(point.x, point.y)))
        const frontierHeads = getSolveFrontierHeads()
          .filter(point => !activeTrailKeys.has(key(point.x, point.y)))
        if (app.visibleElements.subPath) {
          for (const edgeKey of getSolveFrontierTrailEdges(frontierHeads)) {
            const [left, right] = edgeKey.split('>')
            if (left && right) {
              segments.push({
                color: app.styleTheme.subPath,
                from: parsePointKey(left),
                to: parsePointKey(right),
                width: THREE_TRAIL_WIDTH,
              })
            }
          }
        }
        if (app.visibleElements.frontier) {
          for (const point of frontierHeads) {
            dots.push({ color: app.styleTheme.frontier, point, radius: THREE_HEAD_RADIUS })
          }
        }
        if (app.visibleElements.path) {
          pushPolyline(activeTrail, app.styleTheme.path, THREE_TRAIL_WIDTH)
        }
        if (app.visibleElements.head && app.solveCurrentHeadKey) {
          dots.push({ color: app.styleTheme.head, point: parsePointKey(app.solveCurrentHeadKey), radius: THREE_HEAD_RADIUS })
        }
      }
      else {
        if (app.visibleElements.path) {
          pushPolyline(getSolveTrailPoints(), app.styleTheme.path, THREE_TRAIL_WIDTH)
        }
        if (app.visibleElements.head && app.solveCurrentHeadKey) {
          dots.push({ color: app.styleTheme.head, point: parsePointKey(app.solveCurrentHeadKey), radius: THREE_HEAD_RADIUS })
        }
      }
    }
  }

  const floodStarted = floodActive && (app.running || app.stepState.visitedCount > 0)
  const pointMarkers = getPointMarkerVisibility({
    activeTab: solveProgressVisible ? 'solve' : app.activeTab,
    floodActive,
    floodStarted,
    generationAlgorithm: getGenerationAlgorithm(generationSelect.value),
    previewingGeneration: previewing,
    showingSolveResult,
    visibleEnd: app.visibleElements.end,
    visibleStart: app.visibleElements.start,
  })

  app.threeView.sync({
    dots,
    end: pointMarkers.end ? activeMaze.end : null,
    endColor: app.styleTheme.end,
    getCellColor,
    gridColor: app.styleTheme.grid,
    gridVisible: app.visibleElements.grid,
    gridWidth: clamp(app.wallThickness / FIXED_CELL_SIZE, 0.04, 0.4),
    runtime: activeRuntime,
    segments,
    start: pointMarkers.start ? activeMaze.start : null,
    startColor: app.styleTheme.start,
    wallColor: app.styleTheme.wall,
    wallHeight: app.wallHeightPx / FIXED_CELL_SIZE,
    wallsVisible: app.visibleElements.wall,
    wallThickness: clamp(app.wallThickness / FIXED_CELL_SIZE, 0.04, 0.4),
  })
}

function getCellFill(
  runtime: Maze,
  x: number,
  y: number,
  pointKey: string,
  pathSet: Set<string>,
  floodActive: boolean,
): string {
  const floodDepth = floodActive
    ? app.floodDepthByKey[pointKey]
    : undefined
  if (floodDepth !== undefined) {
    return getFloodDepthColor(app.floodTheme, floodDepth, runtime.grid.rows, runtime.grid.cols)
  }

  if (!hasOpenCellEdge(runtime, x, y)) {
    return app.visibleElements.unlinkedCell ? app.styleTheme.unlinkedCell : HIDDEN_CELL_COLOR
  }

  const imageColor = getShapeCellColor(x, y)

  // Editing is concerned only with maze topology. A linked cell must not keep
  // the visit color from an earlier solve result.
  if (app.activeTab === 'edit') {
    return app.visibleElements.cell
      ? (imageColor ?? app.styleTheme.cell)
      : HIDDEN_CELL_COLOR
  }

  // A finished shaped maze shows the full image; solving re-reveals it
  // cell by cell through the visited set below.
  if (app.activeTab === 'generate' && imageColor && !shouldShowSolveResult(false)) {
    return app.visibleElements.visit ? imageColor : HIDDEN_CELL_COLOR
  }

  const solveStartKey = key(app.maze.start.x, app.maze.start.y)
  const isSolveInitialState = app.stepState.status === 'running'
    && app.stepState.visitedCount <= 1
    && app.stepState.path.length === 0
    && !app.running

  if (isSolveInitialState && pointKey === solveStartKey) {
    return app.visibleElements.cell ? app.styleTheme.cell : HIDDEN_CELL_COLOR
  }

  if (app.stepState.visited[pointKey]) {
    if (!app.visibleElements.visit) {
      return HIDDEN_CELL_COLOR
    }
    return imageColor ?? app.styleTheme.visit
  }

  if (pathSet.has(pointKey)) {
    if (!app.visibleElements.cell) {
      return HIDDEN_CELL_COLOR
    }
    return imageColor ?? app.styleTheme.cell
  }

  return app.visibleElements.cell ? app.styleTheme.cell : HIDDEN_CELL_COLOR
}
