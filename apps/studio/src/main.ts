import type { StyleKey } from './lib/types'
import { MAZELY_DEFAULTS } from 'mazely'
import { version as studioVersion } from '../package.json'
import {
  getGenerationAlgorithm,
  getPointMarkerVisibility,
  shouldShowFloodVisualization,
} from './lib/algorithms'
import { app, initAppState } from './lib/app-state'
import {
  initMazeEditor,
  onMazeEditPointerDown,
  onMazeEditPointerMove,
  onMazeEditPointerUp,
} from './lib/controllers/maze-editor'
import { initMazeFileActions } from './lib/controllers/maze-file-actions'
import {
  setOpenPanel,
  togglePanel,
} from './lib/controllers/panels'
import {
  onPreviousStepAction,
  onResetAction,
  onRunAction,
  onStepAction,
  resetSolveState,
  syncLoopSpeed,
} from './lib/controllers/playback'
import { initShapeEditor } from './lib/controllers/shape-editor'
import { showToast, syncUi } from './lib/controllers/status'
import {
  resetStyleTheme,
  syncStyleThemeInputs,
  toggleStyleVisibility,
  updateStyleTheme,
} from './lib/controllers/theme-panel'
import {
  onDoubleClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onWheel,
} from './lib/controllers/view-nav'
import {
  applyGridDimensionChange,
  applyShape,
  clearShape,
  invalidateGenerationPreview,
  setActiveTab,
  syncGridDimensionInputs,
  syncShapePanel,
} from './lib/controllers/workbench'
import {
  getSolveFrontierHeads,
  getSolveFrontierTrails,
  getSolveTrailPoints,
  isSolveMultiHeadMode,
} from './lib/derived'
import {
  canvas,
  canvasWrap,
  controlBar,
  ctx,
  exportSvgButton,
  floodThemeSelect,
  focusViewButton,
  generationSelect,
  lockGridRatioInput,
  mazeHeightInput,
  mazeWidthInput,
  packageVersion,
  panelCollapseButton,
  panelRail,
  playDockToggleButton,
  previousStepButton,
  railThemesButton,
  railWorkbenchButton,
  resetButton,
  runButton,
  shapeClearButton,
  shapeColorsInput,
  shapeEditButton,
  shapeFileInput,
  shapeUploadButton,
  solvingSelect,
  speedRange,
  stepButton,
  styleCellInput,
  styleEndInput,
  styleFrontierInput,
  styleGridInput,
  styleHeadInput,
  stylePathInput,
  styleResetButton,
  styleStartInput,
  styleSubPathInput,
  styleUnlinkedCellInput,
  styleVisitInput,
  styleWallInput,
  tabEdit,
  tabGenerate,
  tabSolve,
  themesPanel,
  topNav,
  useViewportRatioInput,
  view2dButton,
  view3dButton,
  visibilityButtonByKey,
  wallHeightField,
  wallHeightLabel,
  wallHeightRange,
  wallRange,
  workbenchPanel,
} from './lib/dom'
import { buildMazeSvg } from './lib/export-svg'
import { isFloodTheme } from './lib/flood'
import { key, parsePointKey } from './lib/point'
import { ensureThreeView, fitMazeInView, render, resetView } from './lib/renderer'
import { parseRange, resizeHighResCanvas } from './lib/utils'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/700.css'

packageVersion.textContent = `v${studioVersion}`

generationSelect.value = MAZELY_DEFAULTS.generationAlgorithm
solvingSelect.value = MAZELY_DEFAULTS.solvingAlgorithm

initAppState({
  generationAlgorithmValue: generationSelect.value,
  solvingAlgorithmValue: solvingSelect.value,
})

const resizeObserver = new ResizeObserver(() => {
  resizeCanvas()
})

resizeObserver.observe(canvasWrap)
window.addEventListener('resize', resizeCanvas)
window.visualViewport?.addEventListener('resize', resizeCanvas)
let hasFocusedInitialView = false

tabGenerate.addEventListener('click', () => setActiveTab('generate'))
tabSolve.addEventListener('click', () => setActiveTab('solve'))
tabEdit.addEventListener('click', () => {
  setView3d(false)
  setActiveTab('edit')
})

generationSelect.addEventListener('change', invalidateGenerationPreview)
solvingSelect.addEventListener('change', resetSolveState)
floodThemeSelect.addEventListener('change', () => {
  if (!isFloodTheme(floodThemeSelect.value)) {
    return
  }
  app.floodTheme = floodThemeSelect.value
  render()
})
mazeWidthInput.addEventListener('input', () => {
  const changed = applyGridDimensionChange('width')
  if (changed) {
    render()
  }
})
mazeHeightInput.addEventListener('input', () => {
  if (app.useViewportRatio) {
    return
  }

  const changed = applyGridDimensionChange('height')
  if (changed) {
    render()
  }
})
mazeWidthInput.addEventListener('change', () => {
  const changed = applyGridDimensionChange('width')
  if (changed) {
    render()
  }
})
mazeHeightInput.addEventListener('change', () => {
  const changed = applyGridDimensionChange('height')
  if (changed) {
    render()
  }
})
lockGridRatioInput.addEventListener('change', () => {
  app.lockGridRatio = lockGridRatioInput.checked
  if (app.lockGridRatio && app.mazeHeight > 0) {
    app.lockedGridRatio = app.mazeWidth / app.mazeHeight
  }

  const changed = applyGridDimensionChange()
  if (changed) {
    render()
  }
})
useViewportRatioInput.addEventListener('change', () => {
  app.useViewportRatio = useViewportRatioInput.checked
  const changed = applyGridDimensionChange('width')
  if (changed) {
    render()
  }
})
speedRange.addEventListener('input', () => {
  syncLoopSpeed()
  syncUi()
})
wallRange.addEventListener('input', () => {
  app.wallThickness = parseRange(wallRange.value, app.wallThickness)
  syncUi()
  render()
})
function setView3d(enabled: boolean): void {
  if (app.view3d === enabled) {
    return
  }

  app.view3d = enabled
  view2dButton.classList.toggle('is-active', !enabled)
  view3dButton.classList.toggle('is-active', enabled)
  wallHeightField.classList.toggle('is-hidden', !enabled)
  canvas.classList.toggle('is-hidden', enabled)
  app.webgl2dView?.setVisible(!enabled)

  if (enabled) {
    void ensureThreeView().then((view) => {
      view.setVisible(app.view3d)
      render()
    })
    return
  }

  app.threeView?.setVisible(false)
  render()
}

view2dButton.addEventListener('click', () => setView3d(false))
view3dButton.addEventListener('click', () => setView3d(true))
wallHeightRange.addEventListener('input', () => {
  app.wallHeightPx = parseRange(wallHeightRange.value, app.wallHeightPx)
  wallHeightLabel.textContent = `${app.wallHeightPx} px`
  if (app.view3d) {
    render()
  }
})
styleWallInput.addEventListener('input', () => updateStyleTheme('wall', styleWallInput.value))
styleCellInput.addEventListener('input', () => updateStyleTheme('cell', styleCellInput.value))
styleUnlinkedCellInput.addEventListener('input', () => updateStyleTheme('unlinkedCell', styleUnlinkedCellInput.value))
styleSubPathInput.addEventListener('input', () => updateStyleTheme('subPath', styleSubPathInput.value))
styleVisitInput.addEventListener('input', () => updateStyleTheme('visit', styleVisitInput.value))
stylePathInput.addEventListener('input', () => updateStyleTheme('path', stylePathInput.value))
styleHeadInput.addEventListener('input', () => updateStyleTheme('head', styleHeadInput.value))
styleFrontierInput.addEventListener('input', () => updateStyleTheme('frontier', styleFrontierInput.value))
styleStartInput.addEventListener('input', () => updateStyleTheme('start', styleStartInput.value))
styleEndInput.addEventListener('input', () => updateStyleTheme('end', styleEndInput.value))
styleGridInput.addEventListener('input', () => updateStyleTheme('grid', styleGridInput.value))
for (const keyName of Object.keys(visibilityButtonByKey) as StyleKey[]) {
  visibilityButtonByKey[keyName].addEventListener('click', () => toggleStyleVisibility(keyName))
}
styleResetButton.addEventListener('click', resetStyleTheme)

app.shapeEditor = initShapeEditor({
  getDefaultCols: () => 60,
  onApply: applyShape,
  showToast,
})
initMazeEditor()
initMazeFileActions()

exportSvgButton.addEventListener('click', () => {
  if (app.generating || app.running) {
    showToast('Stop the animation before exporting.')
    return
  }

  const activePreview = app.activeTab === 'generate' ? app.generationPreview : null
  const maze = activePreview?.view ?? app.maze
  const runtime = activePreview?.runtime ?? app.mazeRuntime
  if (!runtime) {
    showToast('No maze to export.')
    return
  }
  const floodActive = shouldShowFloodVisualization({
    activeTab: app.activeTab,
    previewingGeneration: activePreview !== null,
    solvingAlgorithm: app.stepState.algorithm,
    solveStarted: app.stepState.visitedCount > 0,
    solveStatus: app.stepState.status,
  })
  const pointMarkers = getPointMarkerVisibility({
    activeTab: app.activeTab,
    floodActive,
    floodStarted: floodActive && (app.running || app.stepState.visitedCount > 0),
    generationAlgorithm: getGenerationAlgorithm(generationSelect.value),
    previewingGeneration: activePreview !== null,
    showingSolveResult: activePreview === null && app.stepState.status !== 'running',
    visibleEnd: app.visibleElements.end,
    visibleStart: app.visibleElements.start,
  })

  downloadTextFile(
    `mazely-${maze.cols}x${maze.rows}.svg`,
    buildMazeSvg({
      flood: floodActive
        ? {
            depthByKey: app.floodDepthByKey,
            theme: app.floodTheme,
          }
        : undefined,
      maze,
      pointMarkers,
      runtime,
      solve: app.activeTab === 'solve' && app.stepState.algorithm !== 'flood'
        ? {
            frontierHeads: getExportSolveFrontierHeads(),
            frontierTrails: getExportSolveFrontierTrails(),
            heads: getExportSolveHeads(),
            path: app.stepState.path,
            trails: getExportSolveTrails(),
            visited: Object.keys(app.stepState.visited).map(parsePointKey),
          }
        : undefined,
      theme: app.styleTheme,
      visibleElements: app.visibleElements,
    }),
    'image/svg+xml;charset=utf-8',
  )
})

function getExportSolveHeads() {
  if (app.stepState.status !== 'running') {
    return []
  }
  return app.solveCurrentHeadKey ? [parsePointKey(app.solveCurrentHeadKey)] : []
}

function getExportSolveTrails() {
  if (app.stepState.status !== 'running') {
    return []
  }
  return [getSolveTrailPoints()]
}

function getExportSolveFrontierHeads() {
  if (!isSolveMultiHeadMode()) {
    return []
  }
  const activeTrailKeys = new Set(getSolveTrailPoints().map(point => key(point.x, point.y)))
  return getSolveFrontierHeads()
    .filter(point => !activeTrailKeys.has(key(point.x, point.y)))
}

function getExportSolveFrontierTrails() {
  const heads = getExportSolveFrontierHeads()
  return getSolveFrontierTrails(heads)
}

shapeUploadButton.addEventListener('click', () => shapeFileInput.click())
shapeEditButton.addEventListener('click', () => {
  if (!app.shapeEditor?.reopen()) {
    shapeFileInput.click()
  }
})
shapeClearButton.addEventListener('click', clearShape)
shapeColorsInput.addEventListener('change', () => {
  app.showShapeColors = shapeColorsInput.checked
  render()
})

railWorkbenchButton.addEventListener('click', () => togglePanel('workbench'))
railThemesButton.addEventListener('click', () => togglePanel('themes'))
panelCollapseButton.addEventListener('click', () => {
  setOpenPanel(app.openPanel === null ? 'workbench' : null)
})

playDockToggleButton.addEventListener('click', () => {
  const collapsed = !controlBar.classList.contains('is-collapsed')
  controlBar.classList.toggle('is-collapsed', collapsed)
  playDockToggleButton.setAttribute('aria-expanded', String(!collapsed))
  playDockToggleButton.title = collapsed ? 'Expand playback dock' : 'Collapse playback dock'
  playDockToggleButton.setAttribute('aria-label', playDockToggleButton.title)
})

function setTopNavExpanded(expanded: boolean): void {
  topNav.classList.toggle('is-expanded', expanded)
  topNav.setAttribute('aria-expanded', String(expanded))
  topNav.title = expanded
    ? 'Collapse Mazely Studio header'
    : 'Expand Mazely Studio header'
}

function toggleTopNav(): void {
  setTopNavExpanded(!topNav.classList.contains('is-expanded'))
}

function isTopNavLinkEvent(event: Event): boolean {
  return event.target instanceof Element && event.target.closest('a') !== null
}

topNav.addEventListener('click', (event) => {
  if (!isTopNavLinkEvent(event)) {
    toggleTopNav()
  }
})
topNav.addEventListener('keydown', (event) => {
  if (isTopNavLinkEvent(event) || (event.key !== 'Enter' && event.key !== ' ')) {
    return
  }

  event.preventDefault()
  toggleTopNav()
})

const mobileLayout = window.matchMedia('(max-width: 767px)')
document.addEventListener('pointerdown', (event) => {
  if (!mobileLayout.matches || !(event.target instanceof Node)) {
    return
  }

  if (topNav.classList.contains('is-expanded') && !topNav.contains(event.target)) {
    setTopNavExpanded(false)
  }

  const openPanel = app.openPanel === 'workbench'
    ? workbenchPanel
    : app.openPanel === 'themes'
      ? themesPanel
      : null
  if (openPanel && !openPanel.contains(event.target) && !panelRail.contains(event.target)) {
    setOpenPanel(null)
  }
})

runButton.addEventListener('click', onRunAction)
previousStepButton.addEventListener('click', onPreviousStepAction)
stepButton.addEventListener('click', onStepAction)
resetButton.addEventListener('click', onResetAction)
focusViewButton.addEventListener('click', resetView)
canvasWrap.addEventListener('wheel', onWheel, { passive: false })
canvasWrap.addEventListener('pointerdown', onMazeEditPointerDown)
canvasWrap.addEventListener('pointerdown', onPointerDown)
canvasWrap.addEventListener('dblclick', onDoubleClick)
window.addEventListener('pointermove', onMazeEditPointerMove)
window.addEventListener('pointermove', onPointerMove)
window.addEventListener('pointerup', onMazeEditPointerUp)
window.addEventListener('pointerup', onPointerUp)
window.addEventListener('pointercancel', onMazeEditPointerUp)
window.addEventListener('pointercancel', onPointerUp)

syncGridDimensionInputs()
syncLoopSpeed()
syncStyleThemeInputs()
syncShapePanel()
setOpenPanel(app.openPanel)
setActiveTab('generate')
resizeCanvas()

function resizeCanvas(): void {
  const previousWidth = app.mazeWidth
  const previousHeight = app.mazeHeight
  const rect = canvasWrap.getBoundingClientRect()
  resizeHighResCanvas(canvas, ctx, rect.width, rect.height)

  if (app.useViewportRatio) {
    const changed = applyGridDimensionChange('width')
    if (!changed && (previousWidth !== app.mazeWidth || previousHeight !== app.mazeHeight)) {
      syncGridDimensionInputs('width')
    }
  }

  app.threeView?.resize()
  app.webgl2dView?.resize()
  if (!hasFocusedInitialView && rect.width > 0 && rect.height > 0) {
    fitMazeInView(app.maze)
    hasFocusedInitialView = true
  }
  render()
}

function downloadTextFile(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
