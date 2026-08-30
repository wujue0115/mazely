import type { TriangleGrid } from 'mazely'
import { cellIdToPoint, pointToCellId, traverseGrid } from 'mazely'
import { app } from '../app-state'
import { bumpGenerationCacheVersion, bumpSolveCacheVersion } from '../derived'
import {
  generationSelect,
  gridTypeSelect,
  loadMazeButton,
  loadMazeFileInput,
  saveMazeButton,
  shapeColorsInput,
  solvingSelect,
  triangleLayoutField,
  triangleLayoutSelect,
  useViewportRatioInput,
  wallHeightRange,
  wallRange,
} from '../dom'
import { DEFAULT_CUSTOM_FLOOD_THEME } from '../flood'
import {
  createMazeFilename,
  decodeMazeFile,
  encodeMazeFile,
  MazeFileError,
} from '../maze-file'
import { key, parsePointKey } from '../point'
import { fitMazeInView, render } from '../renderer'
import {
  clearGenerationPreviewState,
  createStepper,
  stopGenerationAnimation,
  stopSolveAnimation,
} from './playback'
import { showToast, syncUi } from './status'
import { syncStyleThemeInputs } from './theme-panel'
import {
  setActiveTab,
  syncGridDimensionInputs,
  syncShapePanel,
} from './workbench'

const MAX_FILE_SIZE = 64 * 1024 * 1024

export function initMazeFileActions(): void {
  saveMazeButton.addEventListener('click', () => {
    void saveMazeFile()
  })
  loadMazeButton.addEventListener('click', () => loadMazeFileInput.click())
  loadMazeFileInput.addEventListener('change', () => {
    const file = loadMazeFileInput.files?.[0]
    loadMazeFileInput.value = ''
    if (file) {
      void loadMazeFile(file)
    }
  })
}

export function getMazeSaveBlocker(): string | null {
  if (app.generating || app.running) {
    return 'Stop the animation before saving.'
  }
  if (app.generationPreview && !app.generationPreview.player.done) {
    return 'Finish or reset generation before saving.'
  }
  if (!app.hasGeneratedMaze || !app.mazeRuntime) {
    return 'Generate or edit a maze before saving.'
  }
  if (app.stepState.status === 'running' && app.stepState.visitedCount > 0) {
    return 'Finish or reset solving before saving.'
  }
  return null
}

async function saveMazeFile(): Promise<void> {
  const blocker = getMazeSaveBlocker()
  if (blocker) {
    showToast(blocker)
    return
  }

  try {
    saveMazeButton.disabled = true
    const bytes = await encodeMazeFile({
      appearance: {
        customFloodTheme: app.customFloodTheme,
        floorTheme: app.floodTheme,
        showShapeColors: app.showShapeColors,
        styleTheme: app.styleTheme,
        visibleElements: app.visibleElements,
        wallHeightPx: app.wallHeightPx,
        wallThickness: app.wallThickness,
      },
      pointPreferences: {
        generateManualStart: app.generateManualStart,
        generateMode: app.generatePointMode,
        solveManualEnd: app.solveManualEnd,
        solveManualStart: app.solveManualStart,
        solveMode: app.solvePointMode,
      },
      maze: app.maze,
      runtime: app.mazeRuntime!,
      shape: app.shape,
      solve: {
        algorithm: app.stepState.algorithm,
        head: app.stepState.algorithm === 'flood'
          ? null
          : (app.solveCurrentHeadKey ? parsePointKey(app.solveCurrentHeadKey) : null),
        path: app.stepState.path,
        status: app.stepState.status,
        visited: app.stepState.visited,
      },
    })
    downloadBytes(createMazeFilename(app.mazeRuntime!), bytes)
    showToast('Maze file saved.')
  }
  catch (error) {
    showToast(toErrorMessage(error, 'Unable to save this maze.'))
  }
  finally {
    syncUi()
  }
}

async function loadMazeFile(file: File): Promise<void> {
  if (app.generating || app.running) {
    showToast('Stop the animation before opening a maze.')
    return
  }
  if (file.size > MAX_FILE_SIZE) {
    showToast('The maze file is too large.')
    return
  }

  try {
    const loaded = await decodeMazeFile(await file.arrayBuffer())
    stopGenerationAnimation()
    stopSolveAnimation()
    clearGenerationPreviewState()

    app.gridType = loaded.runtime.grid.type
    if (loaded.runtime.grid.type === 'triangle') {
      const grid = loaded.runtime.grid as TriangleGrid
      app.triangleLayout = grid.layout
      app.mazeWidth = grid.layout === 'triangle' ? grid.size! : grid.cols
      app.mazeHeight = grid.layout === 'triangle' ? grid.size! : grid.rows
    }
    else {
      app.mazeWidth = loaded.maze.cols
      app.mazeHeight = loaded.maze.rows
    }
    app.lockedGridRatio = app.mazeWidth / app.mazeHeight
    app.hasValidGridDimensions = true
    app.useViewportRatio = false
    app.maze = loaded.maze
    app.mazeRuntime = loaded.runtime
    app.shape = loaded.shape
    app.shapeEditor?.forgetSource()
    app.hasGeneratedMaze = true
    app.generatePointMode = loaded.pointPreferences.generateMode
    app.generateManualStart = { ...loaded.pointPreferences.generateManualStart }
    app.solvePointMode = loaded.pointPreferences.solveMode
    app.solveManualStart = { ...loaded.pointPreferences.solveManualStart }
    app.solveManualEnd = { ...loaded.pointPreferences.solveManualEnd }
    app.mazeEditVersion += 1
    app.solveRuntime = loaded.runtime
    app.solvePlayer = null
    app.floodDepthByKey = {}

    generationSelect.value = loaded.maze.algorithm
    gridTypeSelect.value = loaded.runtime.grid.type
    triangleLayoutSelect.value = app.triangleLayout
    triangleLayoutField.classList.toggle('is-hidden', app.gridType !== 'triangle')
    solvingSelect.value = loaded.solve.algorithm
    useViewportRatioInput.checked = false
    if (loaded.solve.status === 'generated') {
      app.stepState = createStepper(app.maze, loaded.runtime)
      app.solveCurrentHeadKey = key(app.maze.start.x, app.maze.start.y)
    }
    else {
      app.solveCurrentHeadKey = loaded.solve.head
        ? key(loaded.solve.head.x, loaded.solve.head.y)
        : null
      app.stepState = {
        algorithm: loaded.solve.algorithm,
        cameFrom: {},
        end: { ...loaded.maze.end },
        frontier: new Set<string>(),
        frontierSize: 0,
        path: loaded.solve.path,
        start: { ...loaded.maze.start },
        status: loaded.solve.status,
        visited: loaded.solve.visited,
        visitedCount: Object.keys(loaded.solve.visited).length,
      }
      if (loaded.solve.algorithm === 'flood' && loaded.solve.status === 'solved') {
        app.floodDepthByKey = Object.fromEntries(
          traverseGrid(loaded.runtime.grid, {
            startCellId: pointToCellId(loaded.maze.start),
            strategy: 'bfs',
          }).map((visit) => {
            const point = cellIdToPoint(visit.cellId)
            return [key(point.x, point.y), visit.depth]
          }),
        )
      }
    }
    if (loaded.appearance) {
      app.styleTheme = { ...loaded.appearance.styleTheme }
      app.visibleElements = { ...loaded.appearance.visibleElements }
      app.floodTheme = loaded.appearance.floorTheme
      app.customFloodTheme = loaded.appearance.customFloodTheme
        ? structuredClone(loaded.appearance.customFloodTheme)
        : structuredClone(DEFAULT_CUSTOM_FLOOD_THEME)
      app.wallThickness = loaded.appearance.wallThickness
      app.wallHeightPx = loaded.appearance.wallHeightPx
      app.showShapeColors = loaded.appearance.showShapeColors
      wallRange.value = String(app.wallThickness)
      wallHeightRange.value = String(app.wallHeightPx)
      shapeColorsInput.checked = app.showShapeColors
      syncStyleThemeInputs()
    }

    bumpGenerationCacheVersion()
    bumpSolveCacheVersion()
    syncGridDimensionInputs()
    syncShapePanel()
    setActiveTab(loaded.solve.status === 'generated' ? 'generate' : 'solve', { preservePoints: true })
    fitMazeInView(app.maze)
    syncUi()
    render()
    showToast(`Opened ${loaded.maze.cols}x${loaded.maze.rows} maze.`)
  }
  catch (error) {
    showToast(toErrorMessage(error, 'Unable to open this maze file.'))
  }
}

function downloadBytes(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes.slice().buffer], { type: 'application/vnd.mazely.maze' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof MazeFileError ? error.message : fallback
}
