import type { FloodCurve } from '../flood'
import { app } from '../app-state'
import {
  customFloodCurveButton,
  customFloodEndHex,
  customFloodEndInput,
  customFloodLoopInput,
  customFloodPointsInput,
  customFloodPreview,
  customFloodStartHex,
  customFloodStartInput,
  customFloodTheme,
  floodCurveApply,
  floodCurveBackdrop,
  floodCurveCancel,
  floodCurveClose,
  floodCurveControlLines,
  floodCurveDialog,
  floodCurveGraph,
  floodCurveHandle1,
  floodCurveHandle2,
  floodCurvePath,
  floodCurveReadout,
  floodCurveReset,
  floodThemeSelect,
} from '../dom'
import {
  evaluateFloodCurve,
  generateCustomFloodPreviewColors,
  isFloodTheme,
  LINEAR_FLOOD_CURVE,
  MAX_CUSTOM_FLOOD_POINTS,
  MIN_CUSTOM_FLOOD_POINTS,
} from '../flood'
import { render } from '../renderer'
import { clamp } from '../utils'

let curveBeforeEditing: FloodCurve | null = null
let activeHandle: 1 | 2 | null = null

export function initFloodThemeEditor(): void {
  floodThemeSelect.addEventListener('change', onThemeChange)
  customFloodStartInput.addEventListener('input', () => updateColor('startColor', customFloodStartInput.value))
  customFloodEndInput.addEventListener('input', () => updateColor('endColor', customFloodEndInput.value))
  customFloodPointsInput.addEventListener('change', commitPointCount)
  customFloodLoopInput.addEventListener('change', updateLoop)
  customFloodCurveButton.addEventListener('click', openCurveDialog)
  floodCurveBackdrop.addEventListener('click', cancelCurveEditing)
  floodCurveClose.addEventListener('click', cancelCurveEditing)
  floodCurveCancel.addEventListener('click', cancelCurveEditing)
  floodCurveApply.addEventListener('click', applyCurveEditing)
  floodCurveReset.addEventListener('click', resetCurve)
  floodCurveHandle1.addEventListener('pointerdown', event => startCurveDrag(event, 1))
  floodCurveHandle2.addEventListener('pointerdown', event => startCurveDrag(event, 2))
  floodCurveGraph.addEventListener('pointermove', moveCurveHandle)
  floodCurveGraph.addEventListener('pointerup', endCurveDrag)
  floodCurveGraph.addEventListener('pointercancel', endCurveDrag)
  document.addEventListener('keydown', onDialogKeyDown)
  syncFloodThemeEditor()
}

export function syncFloodThemeEditor(): void {
  floodThemeSelect.value = app.floodTheme
  customFloodTheme.classList.toggle('is-hidden', app.floodTheme !== 'custom')
  const enabled = !floodThemeSelect.disabled && app.floodTheme === 'custom'
  customFloodTheme.classList.toggle('is-disabled', !enabled)
  customFloodStartInput.disabled = !enabled
  customFloodEndInput.disabled = !enabled
  customFloodPointsInput.disabled = !enabled
  customFloodLoopInput.disabled = !enabled
  customFloodCurveButton.disabled = !enabled
  customFloodStartInput.value = app.customFloodTheme.startColor
  customFloodEndInput.value = app.customFloodTheme.endColor
  customFloodPointsInput.value = String(app.customFloodTheme.totalPoints)
  customFloodLoopInput.checked = app.customFloodTheme.loop
  customFloodStartHex.textContent = app.customFloodTheme.startColor
  customFloodEndHex.textContent = app.customFloodTheme.endColor
  updateGradientPreview()
  drawCurve()
}

function onThemeChange(): void {
  const value = floodThemeSelect.value
  if (value !== 'custom' && !isFloodTheme(value)) {
    return
  }
  app.floodTheme = value
  syncFloodThemeEditor()
  render()
}

function updateColor(key: 'startColor' | 'endColor', value: string): void {
  app.customFloodTheme = {
    ...app.customFloodTheme,
    [key]: value.toLowerCase(),
  }
  syncFloodThemeEditor()
  render()
}

function commitPointCount(): void {
  const parsed = Number(customFloodPointsInput.value)
  if (!Number.isFinite(parsed)) {
    normalizePointCountInput()
    return
  }
  app.customFloodTheme = {
    ...app.customFloodTheme,
    totalPoints: clamp(Math.trunc(parsed), MIN_CUSTOM_FLOOD_POINTS, MAX_CUSTOM_FLOOD_POINTS),
  }
  normalizePointCountInput()
  updateGradientPreview()
  render()
}

function normalizePointCountInput(): void {
  customFloodPointsInput.value = String(app.customFloodTheme.totalPoints)
}

function updateLoop(): void {
  app.customFloodTheme = {
    ...app.customFloodTheme,
    loop: customFloodLoopInput.checked,
  }
  updateGradientPreview()
  render()
}

function updateGradientPreview(): void {
  const colors = generateCustomFloodPreviewColors(app.customFloodTheme)
  const lastIndex = colors.length - 1
  const stops = colors.map((color, index) =>
    `${color} ${((index / lastIndex) * 100).toFixed(2)}%`)
  customFloodPreview.style.backgroundImage = `linear-gradient(90deg, ${stops.join(', ')})`
}

function openCurveDialog(): void {
  curveBeforeEditing = { ...app.customFloodTheme.curve }
  floodCurveDialog.classList.remove('is-hidden')
  drawCurve()
  floodCurveReset.focus()
}

function applyCurveEditing(): void {
  curveBeforeEditing = null
  closeCurveDialog()
}

function cancelCurveEditing(): void {
  if (curveBeforeEditing) {
    setCurve(curveBeforeEditing)
  }
  curveBeforeEditing = null
  closeCurveDialog()
}

function closeCurveDialog(): void {
  activeHandle = null
  floodCurveDialog.classList.add('is-hidden')
  customFloodCurveButton.focus()
}

function resetCurve(): void {
  setCurve(LINEAR_FLOOD_CURVE)
}

function startCurveDrag(event: PointerEvent, handle: 1 | 2): void {
  activeHandle = handle
  floodCurveGraph.setPointerCapture(event.pointerId)
  moveCurveHandle(event)
}

function moveCurveHandle(event: PointerEvent): void {
  if (activeHandle === null) {
    return
  }
  const bounds = floodCurveGraph.getBoundingClientRect()
  const x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1)
  const y = 1 - clamp((event.clientY - bounds.top) / bounds.height, 0, 1)
  const curve = { ...app.customFloodTheme.curve }
  if (activeHandle === 1) {
    curve.x1 = x
    curve.y1 = y
  }
  else {
    curve.x2 = x
    curve.y2 = y
  }
  setCurve(curve)
}

function endCurveDrag(event: PointerEvent): void {
  if (floodCurveGraph.hasPointerCapture(event.pointerId)) {
    floodCurveGraph.releasePointerCapture(event.pointerId)
  }
  activeHandle = null
}

function setCurve(curve: FloodCurve): void {
  app.customFloodTheme = {
    ...app.customFloodTheme,
    curve: { ...curve },
  }
  updateGradientPreview()
  drawCurve()
  render()
}

function drawCurve(): void {
  const curve = app.customFloodTheme.curve
  const toX = (value: number): number => value * 300
  const toY = (value: number): number => (1 - value) * 300
  const points = Array.from({ length: 61 }, (_, index) => {
    const x = index / 60
    return `${toX(x).toFixed(1)},${toY(evaluateFloodCurve(curve, x)).toFixed(1)}`
  })
  floodCurvePath.setAttribute('d', `M${points.join('L')}`)
  floodCurveControlLines.setAttribute(
    'd',
    `M0 300L${toX(curve.x1)} ${toY(curve.y1)}M300 0L${toX(curve.x2)} ${toY(curve.y2)}`,
  )
  floodCurveHandle1.setAttribute('cx', String(toX(curve.x1)))
  floodCurveHandle1.setAttribute('cy', String(toY(curve.y1)))
  floodCurveHandle2.setAttribute('cx', String(toX(curve.x2)))
  floodCurveHandle2.setAttribute('cy', String(toY(curve.y2)))
  floodCurveReadout.textContent = `cubic-bezier(${format(curve.x1)}, ${format(curve.y1)}, ${format(curve.x2)}, ${format(curve.y2)})`
}

function onDialogKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && !floodCurveDialog.classList.contains('is-hidden')) {
    cancelCurveEditing()
  }
}

function format(value: number): string {
  return value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}
