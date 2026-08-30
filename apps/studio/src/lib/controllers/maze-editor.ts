import type { MazeEditTarget, MazeEditTool } from '../types'
import { pointToCellId } from 'mazely'
import { getGenerationAlgorithm, getSolvingAlgorithm, shouldUseRandomGenerationStart } from '../algorithms'
import { app } from '../app-state'
import { bumpSolveCacheVersion } from '../derived'
import {
  canvasWrap,
  editClearSolveButton,
  editCloseAllButton,
  editEndReadout,
  editOpenAllButton,
  editStartReadout,
  editToolEdgeButton,
  editToolEndButton,
  editToolPanButton,
  editToolStartButton,
  generateManualPoints,
  generatePointsAutoInput,
  generateStartButton,
  generateStartNote,
  generateStartReadout,
  generationSelect,
  solveEndButton,
  solveManualActions,
  solvePointsAutoInput,
  solveStartButton,
  solvingSelect,
} from '../dom'
import { distanceToSegment, getGridBounds, getSharedBoundary, hitTestCell } from '../grid-geometry'
import { key } from '../point'
import { render } from '../renderer'
import { FIXED_CELL_SIZE } from '../types'
import {
  clearGenerationPreviewState,
  createStepper,
  stopGenerationAnimation,
  stopSolveAnimation,
} from './playback'
import { showToast } from './status'

const editToolButtonByKey: Record<MazeEditTool, HTMLButtonElement> = {
  edge: editToolEdgeButton,
  end: editToolEndButton,
  pan: editToolPanButton,
  start: editToolStartButton,
}

export function initMazeEditor(): void {
  for (const tool of Object.keys(editToolButtonByKey) as MazeEditTool[]) {
    editToolButtonByKey[tool].addEventListener('click', () => setEditTool(tool))
  }

  editOpenAllButton.addEventListener('click', () => {
    applyMazeEdit(() => app.mazeRuntime?.openAllEdges())
  })
  editCloseAllButton.addEventListener('click', () => {
    applyMazeEdit(() => app.mazeRuntime?.closeAllEdges())
  })
  editClearSolveButton.addEventListener('click', () => {
    applyMazeEdit(() => app.mazeRuntime?.clearSolveState())
  })
}

export function setEditTool(tool: MazeEditTool): void {
  app.editTool = tool
  setHoverTarget(null)
  syncMazeEditorUi()
  render()
}

export function syncMazeEditorUi(): void {
  for (const tool of Object.keys(editToolButtonByKey) as MazeEditTool[]) {
    const active = app.editTool === tool
    const button = editToolButtonByKey[tool]
    button.classList.toggle('is-active', active)
    button.setAttribute('aria-pressed', String(active))
  }

  editStartReadout.textContent = `${app.maze.start.x}, ${app.maze.start.y}`
  editEndReadout.textContent = `${app.maze.end.x}, ${app.maze.end.y}`
  syncPointSelectionUi()
}

export function syncPointSelectionUi(): void {
  const generationUsesStart = shouldUseRandomGenerationStart(getGenerationAlgorithm(generationSelect.value))
  const flood = getSolvingAlgorithm(solvingSelect.value) === 'flood'
  generatePointsAutoInput.checked = app.generatePointMode === 'auto'
  solvePointsAutoInput.checked = app.solvePointMode === 'auto'
  generateManualPoints.classList.toggle('is-hidden', app.generatePointMode === 'auto' || !generationUsesStart)
  solveManualActions.classList.toggle('is-hidden', app.solvePointMode === 'auto')
  solveManualActions.classList.toggle('is-start-only', flood)
  solveEndButton.classList.toggle('is-hidden', flood)
  generateStartNote.textContent = generationUsesStart
    ? (app.generatePointMode === 'auto'
        ? 'Automatic random start selection'
        : 'Select the cell where generation begins.')
    : 'This algorithm does not use a start point.'
  const generationStart = app.generatePointMode === 'auto'
    ? app.maze.start
    : app.generateManualStart
  generateStartReadout.textContent = `${generationStart.x}, ${generationStart.y}`
  generateStartButton.classList.toggle('is-active', app.pointPicker?.owner === 'generate')
  solveStartButton.classList.toggle('is-active', app.pointPicker?.owner === 'solve' && app.pointPicker.target === 'start')
  solveEndButton.classList.toggle('is-active', app.pointPicker?.owner === 'solve' && app.pointPicker.target === 'end')
  generateStartButton.setAttribute('aria-pressed', String(app.pointPicker?.owner === 'generate'))
  solveStartButton.setAttribute('aria-pressed', String(app.pointPicker?.owner === 'solve' && app.pointPicker.target === 'start'))
  solveEndButton.setAttribute('aria-pressed', String(app.pointPicker?.owner === 'solve' && app.pointPicker.target === 'end'))
}

export function beginPointSelection(owner: 'generate' | 'solve', target: 'start' | 'end'): void {
  if ((owner === 'generate' && app.generatePointMode !== 'manual')
    || (owner === 'solve' && app.solvePointMode !== 'manual')) {
    return
  }
  if (app.view3d) {
    showToast('Switch to 2D view to select maze points.')
    return
  }
  if (owner === 'generate') {
    stopGenerationAnimation()
    clearGenerationPreviewState()
  }
  else {
    stopSolveAnimation()
  }
  app.pointPicker = app.pointPicker?.owner === owner && app.pointPicker.target === target
    ? null
    : { owner, target }
  setHoverTarget(null)
  syncPointSelectionUi()
  render()
}

export function cancelPointSelection(): void {
  if (!app.pointPicker) {
    return
  }
  app.pointPicker = null
  setHoverTarget(null)
  syncPointSelectionUi()
}

export function onMazeEditPointerDown(event: PointerEvent): void {
  const pickingPoint = app.pointPicker?.owner === app.activeTab
  if ((!pickingPoint && (app.activeTab !== 'edit' || app.editTool === 'pan')) || app.view3d || event.button !== 0) {
    return
  }

  event.preventDefault()
  if (pickingPoint) {
    event.stopImmediatePropagation()
  }
  app.editingMaze = true
  app.editPointerId = event.pointerId
  app.editLastTargetKey = null
  canvasWrap.setPointerCapture(event.pointerId)
  updateHoverTarget(event)
  applyPointerEdit(event)
}

export function onMazeEditPointerMove(event: PointerEvent): void {
  const pickingPoint = app.pointPicker?.owner === app.activeTab
  if ((!pickingPoint && (app.activeTab !== 'edit' || app.editTool === 'pan')) || app.view3d) {
    setHoverTarget(null)
    return
  }

  if (!app.editingMaze) {
    if (!isCanvasPointerEvent(event)) {
      setHoverTarget(null)
      return
    }
    updateHoverTarget(event)
    return
  }

  if (event.pointerId !== app.editPointerId) {
    return
  }

  event.preventDefault()
  updateHoverTarget(event)
  applyPointerEdit(event)
}

export function onMazeEditPointerUp(event: PointerEvent): void {
  if (!app.editingMaze || event.pointerId !== app.editPointerId) {
    return
  }

  app.editingMaze = false
  app.editPointerId = null
  app.editLastTargetKey = null
  if (canvasWrap.hasPointerCapture(event.pointerId)) {
    canvasWrap.releasePointerCapture(event.pointerId)
  }
}

function applyPointerEdit(event: PointerEvent): void {
  const target = getEditTarget(event)
  if (!target) {
    return
  }

  const targetKey = getEditTargetKey(target)
  if (targetKey === app.editLastTargetKey) {
    return
  }
  app.editLastTargetKey = targetKey

  const tool = app.editTool
  if (app.pointPicker) {
    if (target.type !== 'cell') {
      return
    }
    applyPickedPoint({ x: target.x, y: target.y })
    return
  }
  if (tool === 'start' || tool === 'end') {
    if (target.type !== 'cell') {
      return
    }
    applyMazeEdit(() => setStartOrEndPoint(tool, { x: target.x, y: target.y }))
    return
  }

  if (target.type !== 'edge') {
    return
  }

  applyMazeEdit(() => {
    app.mazeRuntime?.setEdgeOpenedBetween(target.from, target.to, !isEdgeOpened(target))
  })
}

function updateHoverTarget(event: PointerEvent): void {
  setHoverTarget(getEditTarget(event))
}

function setHoverTarget(target: MazeEditTarget | null): void {
  if (getNullableEditTargetKey(target) === getNullableEditTargetKey(app.editHoverTarget)) {
    return
  }

  app.editHoverTarget = target
  render()
}

function applyMazeEdit(callback: () => void): void {
  if (!app.mazeRuntime) {
    return
  }

  const openedEdgesBefore = countOpenedEdges()
  const startBefore = key(app.maze.start.x, app.maze.start.y)
  const endBefore = key(app.maze.end.x, app.maze.end.y)

  stopGenerationAnimation()
  stopSolveAnimation()
  clearGenerationPreviewState()
  if (app.solvePlayer && !app.solvePlayer.done) {
    app.solvePlayer.reset()
  }

  try {
    callback()
    const mazeChanged = openedEdgesBefore !== countOpenedEdges()
      || startBefore !== key(app.maze.start.x, app.maze.start.y)
      || endBefore !== key(app.maze.end.x, app.maze.end.y)
    if (mazeChanged) {
      app.hasGeneratedMaze = true
      app.mazeEditVersion += 1
    }
    app.stepState = createStepper(app.maze, app.mazeRuntime)
    app.solveCurrentHeadKey = key(app.stepState.start.x, app.stepState.start.y)
    bumpSolveCacheVersion()
    syncMazeEditorUi()
    render()
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to edit maze.'
    showToast(message)
  }
}

function countOpenedEdges(): number {
  return app.mazeRuntime?.grid.edges.reduce(
    (count, edge) => count + Number(edge.opened),
    0,
  ) ?? 0
}

function setStartOrEndPoint(tool: 'start' | 'end', point: { x: number, y: number }): void {
  if (!app.mazeRuntime?.grid.getCell(pointToCellId(point))) {
    return
  }

  const other = tool === 'start' ? app.maze.end : app.maze.start
  if (getSolvingAlgorithm(solvingSelect.value) !== 'flood'
    && point.x === other.x
    && point.y === other.y) {
    showToast('Start and end points must be different.')
    return
  }

  app.maze = {
    ...app.maze,
    [tool]: point,
  }
  if (tool === 'start') {
    app.generateManualStart = { ...point }
    app.solveManualStart = { ...point }
  }
  else {
    app.solveManualEnd = { ...point }
  }
}

function applyPickedPoint(point: { x: number, y: number }): void {
  const picker = app.pointPicker
  if (!picker || !app.mazeRuntime?.grid.getCell(pointToCellId(point))) {
    return
  }
  if (picker.owner === 'solve') {
    const other = picker.target === 'start' ? app.solveManualEnd : app.solveManualStart
    if (point.x === other.x && point.y === other.y && getSolvingAlgorithm(solvingSelect.value) !== 'flood') {
      showToast('Start and end points must be different.')
      return
    }
  }

  stopGenerationAnimation()
  stopSolveAnimation()
  if (picker.owner === 'generate') {
    clearGenerationPreviewState()
    app.generateManualStart = { ...point }
    app.maze = { ...app.maze, start: { ...point } }
  }
  else if (picker.target === 'start') {
    app.solveManualStart = { ...point }
    app.maze = { ...app.maze, start: { ...point } }
  }
  else {
    app.solveManualEnd = { ...point }
    app.maze = { ...app.maze, end: { ...point } }
  }
  app.pointPicker = null
  app.stepState = createStepper(app.maze, app.mazeRuntime)
  app.solveCurrentHeadKey = key(app.stepState.start.x, app.stepState.start.y)
  bumpSolveCacheVersion()
  syncMazeEditorUi()
  render()
}

function getEditTarget(event: PointerEvent): MazeEditTarget | null {
  const point = getMazePointFromEvent(event)
  if (!point) {
    return null
  }

  const runtime = app.mazeRuntime
  if (!runtime) {
    return null
  }
  const hitCell = hitTestCell(runtime, point)
  if (!hitCell) {
    return null
  }
  const cellX = hitCell.col
  const cellY = hitCell.row

  if (app.pointPicker || app.editTool === 'start' || app.editTool === 'end') {
    return { type: 'cell', x: cellX, y: cellY }
  }

  if (runtime.grid.type === 'triangle') {
    const candidates = hitCell.getEdges().flatMap((edge) => {
      const otherId = edge.getOther(hitCell)?.id
      const other = otherId ? runtime.grid.getCell(otherId) : undefined
      const boundary = other ? getSharedBoundary(hitCell, other) : null
      return other && boundary
        ? [{ boundary, distance: distanceToSegment(point, boundary), other }]
        : []
    }).sort((a, b) => a.distance - b.distance)
    const candidate = candidates[0]
    return candidate
      ? {
          from: { x: cellX, y: cellY },
          to: { x: candidate.other.col, y: candidate.other.row },
          type: 'edge',
        }
      : null
  }

  const localX = point.x - cellX
  const localY = point.y - cellY
  const edgeCandidates = [
    { distance: localY, from: { x: cellX, y: cellY }, to: { x: cellX, y: cellY - 1 } },
    { distance: 1 - localX, from: { x: cellX, y: cellY }, to: { x: cellX + 1, y: cellY } },
    { distance: 1 - localY, from: { x: cellX, y: cellY }, to: { x: cellX, y: cellY + 1 } },
    { distance: localX, from: { x: cellX, y: cellY }, to: { x: cellX - 1, y: cellY } },
  ].sort((a, b) => a.distance - b.distance)

  for (const candidate of edgeCandidates) {
    if (isExistingCell(candidate.to.x, candidate.to.y)) {
      return {
        from: candidate.from,
        to: candidate.to,
        type: 'edge',
      }
    }
  }

  return null
}

function getMazePointFromEvent(event: PointerEvent): { x: number, y: number } | null {
  const rect = canvasWrap.getBoundingClientRect()
  if (!app.mazeRuntime) {
    return null
  }
  const bounds = getGridBounds(app.mazeRuntime)
  const mazePixelWidth = bounds.width * FIXED_CELL_SIZE
  const mazePixelHeight = bounds.height * FIXED_CELL_SIZE
  const offsetX = (rect.width - mazePixelWidth) / 2
  const offsetY = (rect.height - mazePixelHeight) / 2
  const worldX = (event.clientX - rect.left - app.panX) / app.zoom - offsetX
  const worldY = (event.clientY - rect.top - app.panY) / app.zoom - offsetY
  const x = worldX / FIXED_CELL_SIZE
  const y = worldY / FIXED_CELL_SIZE
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0) {
    return null
  }
  return { x, y }
}

function isExistingCell(x: number, y: number): boolean {
  return app.mazeRuntime?.grid.getCell(pointToCellId({ x, y })) !== undefined
}

function isEdgeOpened(target: Extract<MazeEditTarget, { type: 'edge' }>): boolean {
  const fromCell = app.mazeRuntime?.grid.getCell(pointToCellId(target.from))
  const toCell = app.mazeRuntime?.grid.getCell(pointToCellId(target.to))
  if (!fromCell || !toCell) {
    return false
  }

  return fromCell.getEdges().find(edge => edge.getOther(fromCell)?.id === toCell.id)?.opened ?? false
}

function isCanvasPointerEvent(event: PointerEvent): boolean {
  return event.target instanceof Node && canvasWrap.contains(event.target)
}

function getNullableEditTargetKey(target: MazeEditTarget | null): string {
  return target ? getEditTargetKey(target) : ''
}

function getEditTargetKey(target: MazeEditTarget): string {
  if (target.type === 'cell') {
    return `cell:${target.x}:${target.y}:${app.editTool}`
  }

  return `edge:${target.from.x}:${target.from.y}:${target.to.x}:${target.to.y}:${app.editTool}`
}
