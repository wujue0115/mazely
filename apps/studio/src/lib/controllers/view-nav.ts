import { app } from '../app-state'
import { canvasWrap } from '../dom'
import { getZoomBounds, render, resetView } from '../renderer'
import { clamp, getWheelZoomFactor } from '../utils'

interface ActiveViewPointer {
  x: number
  y: number
}

const activeViewPointers = new Map<number, ActiveViewPointer>()
let pinchDistance = 0
let pinchCenterX = 0
let pinchCenterY = 0

export function onWheel(event: WheelEvent): void {
  event.preventDefault()

  if (app.view3d) {
    const zoomFactor = getWheelZoomFactor(event.deltaY, getActiveMazeSpan())
    app.threeView?.zoomAt(event, zoomFactor)
    return
  }

  const rect = canvasWrap.getBoundingClientRect()
  const cursorX = event.clientX - rect.left
  const cursorY = event.clientY - rect.top

  const zoomFactor = getWheelZoomFactor(event.deltaY, getActiveMazeSpan())
  zoomAt(cursorX, cursorY, zoomFactor)
}

function getActiveMazeSpan(): number {
  const activeMaze = app.activeTab === 'generate' && app.generationPreview
    ? app.generationPreview.view
    : app.maze
  return Math.max(1, activeMaze.cols, activeMaze.rows)
}

export function onPointerDown(event: PointerEvent): void {
  if ((app.activeTab === 'edit' && app.editTool !== 'pan') || app.view3d || event.button !== 0) {
    return
  }

  event.preventDefault()
  const point = getCanvasPoint(event)
  activeViewPointers.set(event.pointerId, point)
  if (activeViewPointers.size >= 2) {
    startPinch()
    app.dragging = false
    app.activePointerId = null
  }
  else {
    app.dragging = true
    app.activePointerId = event.pointerId
    app.lastPointerX = point.x
    app.lastPointerY = point.y
  }

  canvasWrap.classList.add('is-dragging')
  canvasWrap.setPointerCapture(event.pointerId)
}

export function onPointerMove(event: PointerEvent): void {
  let point: ActiveViewPointer | null = null
  const activePointer = activeViewPointers.get(event.pointerId)
  if (activePointer) {
    event.preventDefault()
    point = getCanvasPoint(event)
    activePointer.x = point.x
    activePointer.y = point.y

    if (activeViewPointers.size >= 2) {
      updatePinch()
      return
    }
  }

  if (!app.dragging || event.pointerId !== app.activePointerId) {
    return
  }

  event.preventDefault()
  point ??= getCanvasPoint(event)
  const deltaX = point.x - app.lastPointerX
  const deltaY = point.y - app.lastPointerY
  app.lastPointerX = point.x
  app.lastPointerY = point.y
  app.panX += deltaX
  app.panY += deltaY
  render()
}

export function onPointerUp(event: PointerEvent): void {
  if (!activeViewPointers.has(event.pointerId) && (!app.dragging || event.pointerId !== app.activePointerId)) {
    return
  }

  activeViewPointers.delete(event.pointerId)
  if (canvasWrap.hasPointerCapture(event.pointerId)) {
    canvasWrap.releasePointerCapture(event.pointerId)
  }
  if (activeViewPointers.size >= 2) {
    startPinch()
    return
  }

  if (activeViewPointers.size === 1) {
    const [pointerId, point] = [...activeViewPointers.entries()][0]
    app.dragging = true
    app.activePointerId = pointerId
    app.lastPointerX = point.x
    app.lastPointerY = point.y
    return
  }

  pinchDistance = 0
  app.dragging = false
  app.activePointerId = null
  canvasWrap.classList.remove('is-dragging')
}

export function onDoubleClick(event: MouseEvent): void {
  event.preventDefault()
  if (app.view3d) {
    app.threeView?.resetCamera()
    render()
    return
  }
  resetView()
}

function getCanvasPoint(event: PointerEvent): ActiveViewPointer {
  const rect = canvasWrap.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }
}

function getFirstTwoPointers(): [ActiveViewPointer, ActiveViewPointer] | null {
  const pointers = [...activeViewPointers.values()]
  if (pointers.length < 2) {
    return null
  }
  return [pointers[0], pointers[1]]
}

function startPinch(): void {
  const pointers = getFirstTwoPointers()
  if (!pointers) {
    return
  }

  const [a, b] = pointers
  pinchDistance = Math.hypot(b.x - a.x, b.y - a.y)
  pinchCenterX = (a.x + b.x) / 2
  pinchCenterY = (a.y + b.y) / 2
}

function updatePinch(): void {
  const pointers = getFirstTwoPointers()
  if (!pointers) {
    return
  }

  const [a, b] = pointers
  const nextDistance = Math.hypot(b.x - a.x, b.y - a.y)
  const nextCenterX = (a.x + b.x) / 2
  const nextCenterY = (a.y + b.y) / 2
  if (pinchDistance <= 0 || nextDistance <= 0) {
    startPinch()
    return
  }

  app.panX += nextCenterX - pinchCenterX
  app.panY += nextCenterY - pinchCenterY
  const zoomed = zoomAt(nextCenterX, nextCenterY, nextDistance / pinchDistance)
  if (!zoomed) {
    render()
  }
  pinchDistance = nextDistance
  pinchCenterX = nextCenterX
  pinchCenterY = nextCenterY
}

function zoomAt(cursorX: number, cursorY: number, zoomFactor: number): boolean {
  const oldZoom = app.zoom
  const bounds = getZoomBounds()
  const nextZoom = clamp(app.zoom * zoomFactor, bounds.min, bounds.max)
  if (nextZoom === oldZoom) {
    return false
  }

  const factor = nextZoom / oldZoom
  app.panX = cursorX - factor * (cursorX - app.panX)
  app.panY = cursorY - factor * (cursorY - app.panY)
  app.zoom = nextZoom
  render()
  return true
}
