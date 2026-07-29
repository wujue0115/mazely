import type { MazePoint } from './maze-types'

type BackingStoreContext = CanvasRenderingContext2D & {
  backingStorePixelRatio?: number
  mozBackingStorePixelRatio?: number
  msBackingStorePixelRatio?: number
  oBackingStorePixelRatio?: number
  webkitBackingStorePixelRatio?: number
}

type ViewportWindow = Window & typeof globalThis & {
  mozDevicePixelRatio?: number
  webkitDevicePixelRatio?: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export const GRID_DIMENSION_MAX = 500
export const BASE_WHEEL_ZOOM_STEP = 0.06

export function getRandomMazePoint(width: number, height: number): MazePoint {
  return {
    x: Math.floor(Math.random() * width),
    y: Math.floor(Math.random() * height),
  }
}

export function query<T extends Element>(selector: string): T {
  const element = document.querySelector(selector)
  if (!element) {
    throw new Error(`Missing required element: ${selector}`)
  }

  return element as T
}

export function getContext2d(targetCanvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = targetCanvas.getContext('2d')
  if (!context) {
    throw new Error('2D context is unavailable')
  }

  return context
}

export function getViewportPixelRatio(): number {
  const viewport = window as ViewportWindow
  return viewport.devicePixelRatio
    || viewport.webkitDevicePixelRatio
    || viewport.mozDevicePixelRatio
    || 1
}

export function getCanvasPixelRatio(context: CanvasRenderingContext2D): number {
  const backingContext = context as BackingStoreContext
  const backingStoreRatio = backingContext.backingStorePixelRatio
    || backingContext.webkitBackingStorePixelRatio
    || backingContext.mozBackingStorePixelRatio
    || backingContext.msBackingStorePixelRatio
    || backingContext.oBackingStorePixelRatio
    || 1

  return getViewportPixelRatio() / backingStoreRatio
}

export function resizeHighResCanvas(
  targetCanvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
): void {
  const width = Math.max(1, cssWidth)
  const height = Math.max(1, cssHeight)
  const ratio = getCanvasPixelRatio(context)

  targetCanvas.width = Math.max(1, Math.round(width * ratio))
  targetCanvas.height = Math.max(1, Math.round(height * ratio))
  targetCanvas.style.width = `${width}px`
  targetCanvas.style.height = `${height}px`
  context.setTransform(ratio, 0, 0, ratio, 0, 0)
}

export function parseRange(value: string, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function getWheelZoomFactor(deltaY: number, span: number): number {
  const zoomStep = getMazeScaledWheelZoomStep(span)
  const wheelUnits = clamp(Math.abs(deltaY) / 100, 0.25, 4)
  const direction = deltaY < 0 ? 1 : -1
  return 1 + direction * zoomStep * wheelUnits
}

export function getMazeScaledWheelZoomStep(span: number): number {
  const scale = Math.sqrt(Math.max(1, span) / 20)
  return clamp(BASE_WHEEL_ZOOM_STEP * scale, BASE_WHEEL_ZOOM_STEP, 0.24)
}

export function parseGridDimension(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return fallback
  }

  return clamp(parsed, 1, GRID_DIMENSION_MAX)
}

export function parseGridDimensionOptional(value: string): number | null {
  if (value.trim() === '') {
    return null
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return clamp(parsed, 1, GRID_DIMENSION_MAX)
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value)
}

export function toRgba(hexColor: string, alpha: number): string {
  const normalized = hexColor.replace('#', '')
  if (normalized.length !== 6) {
    return hexColor
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`
}
