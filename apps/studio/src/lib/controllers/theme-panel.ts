import type { StyleKey, StyleTheme } from '../types'
import { getGenerationAlgorithm, isGenerationVisibleMultiHeadMode } from '../algorithms'
import { app } from '../app-state'
import {
  floodThemeField,
  floodThemeSelect,
  generationSelect,
  styleCellInput,
  styleChipByKey,
  styleEndInput,
  styleFrontierInput,
  styleGridInput,
  styleHeadInput,
  styleHexByKey,
  stylePathInput,
  styleStartInput,
  styleSubPathInput,
  styleUnlinkedCellInput,
  styleVisitInput,
  styleWallInput,
  visibilityButtonByKey,
} from '../dom'
import { DEFAULT_FLOOD_THEME } from '../flood'
import { render } from '../renderer'
import { DEFAULT_STYLE_THEME, DEFAULT_STYLE_VISIBILITY } from '../types'
import { isHexColor } from '../utils'

function getVisibleStyleKeys(): Set<StyleKey> {
  const visible = new Set<StyleKey>(['grid', 'wall', 'cell', 'unlinkedCell'])

  if (app.activeTab === 'generate') {
    visible.add('visit')
    visible.add('path')
    const algorithm = getGenerationAlgorithm(generationSelect.value)
    visible.add('head')
    if (isGenerationVisibleMultiHeadMode(algorithm)) {
      visible.add('frontier')
      visible.add('subPath')
    }
    if (algorithm !== 'kruskal') {
      visible.add('start')
    }
    return visible
  }

  if (app.activeTab === 'edit') {
    visible.add('start')
    visible.add('end')
    return visible
  }

  if (app.activeTab === 'solve' && app.stepState.algorithm === 'flood') {
    visible.add('start')
    return visible
  }

  visible.add('visit')
  visible.add('path')
  visible.add('start')
  visible.add('end')
  visible.add('head')
  return visible
}

export function syncStyleEditingVisibility(): void {
  const visible = getVisibleStyleKeys()
  for (const keyName of Object.keys(styleChipByKey) as StyleKey[]) {
    styleChipByKey[keyName].classList.toggle('is-hidden', !visible.has(keyName))
  }
  floodThemeField.classList.toggle(
    'is-hidden',
    app.activeTab !== 'solve' || app.stepState.algorithm !== 'flood',
  )
}

export function syncStyleThemeInputs(): void {
  floodThemeSelect.value = app.floodTheme
  styleGridInput.value = app.styleTheme.grid
  styleWallInput.value = app.styleTheme.wall
  styleCellInput.value = app.styleTheme.cell
  styleUnlinkedCellInput.value = app.styleTheme.unlinkedCell
  styleSubPathInput.value = app.styleTheme.subPath
  styleVisitInput.value = app.styleTheme.visit
  stylePathInput.value = app.styleTheme.path
  styleHeadInput.value = app.styleTheme.head
  styleFrontierInput.value = app.styleTheme.frontier
  styleStartInput.value = app.styleTheme.start
  styleEndInput.value = app.styleTheme.end
  syncStyleVisibilityInputs()

  for (const keyName of Object.keys(styleHexByKey) as StyleKey[]) {
    styleHexByKey[keyName].textContent = app.styleTheme[keyName]
  }
  syncPointIndicatorColors()
}

export function updateStyleTheme(keyName: keyof StyleTheme, value: string): void {
  if (!isHexColor(value)) {
    return
  }

  app.styleTheme = {
    ...app.styleTheme,
    [keyName]: value.toLowerCase(),
  }
  styleHexByKey[keyName].textContent = app.styleTheme[keyName]
  if (keyName === 'start' || keyName === 'end') {
    syncPointIndicatorColors()
  }
  render()
}

export function syncStyleVisibilityInputs(): void {
  for (const keyName of Object.keys(visibilityButtonByKey) as StyleKey[]) {
    const visible = app.visibleElements[keyName]
    const button = visibilityButtonByKey[keyName]
    button.classList.toggle('is-visible', visible)
    button.setAttribute('aria-pressed', String(visible))
  }
}

export function toggleStyleVisibility(keyName: StyleKey): void {
  app.visibleElements = {
    ...app.visibleElements,
    [keyName]: !app.visibleElements[keyName],
  }
  syncStyleVisibilityInputs()
  render()
}

/** Keeps the solve panel's start and end dots on the current theme colors. */
function syncPointIndicatorColors(): void {
  document.documentElement.style.setProperty('--start-point-color', app.styleTheme.start)
  document.documentElement.style.setProperty('--end-point-color', app.styleTheme.end)
}

export function resetStyleTheme(): void {
  app.floodTheme = DEFAULT_FLOOD_THEME
  app.styleTheme = { ...DEFAULT_STYLE_THEME }
  app.visibleElements = { ...DEFAULT_STYLE_VISIBILITY }
  syncStyleThemeInputs()
  render()
}
