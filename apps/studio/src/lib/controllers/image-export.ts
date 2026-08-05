import type {
  ExportBackground,
  ImageExportFormat,
  ViewportCaptureSource,
} from '../export-image'
import { app } from '../app-state'
import {
  canvasWrap,
  exportBackgroundField,
  exportBackgroundSelect,
  exportButton,
  exportDialog,
  exportDialogBackdrop,
  exportDialogClose,
  exportDownloadButton,
  exportFormatSelect,
  exportMeta,
  exportQualityField,
  exportQualityLabel,
  exportQualityRange,
  exportSvgOption,
} from '../dom'
import {
  buildExportFilename,
  captureViewport,
  downloadBlob,
  encodeRasterImage,
  normalizeRasterExportOptions,
} from '../export-image'
import { ensureThreeView, ensureWebgl2dView, render } from '../renderer'
import { getViewportPixelRatio } from '../utils'

interface ImageExportOptions {
  exportSvg: () => void
  showToast: (message: string) => void
}

const IMAGE_EXPORT_FORMATS = new Set<ImageExportFormat>(['jpeg', 'png', 'svg', 'webp'])
let exporting = false

export function initImageExport(options: ImageExportOptions): void {
  exportButton.addEventListener('click', () => openExportDialog(options))
  exportDialogBackdrop.addEventListener('click', closeExportDialog)
  exportDialogClose.addEventListener('click', closeExportDialog)
  exportFormatSelect.addEventListener('change', syncExportFields)
  exportBackgroundSelect.addEventListener('change', syncExportFields)
  exportQualityRange.addEventListener('input', syncExportFields)
  exportDownloadButton.addEventListener('click', () => void exportCurrentView(options))
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !exportDialog.classList.contains('is-hidden')) {
      closeExportDialog()
    }
  })
}

function openExportDialog(options: ImageExportOptions): void {
  if (app.generating || app.running) {
    options.showToast('Stop the animation before exporting.')
    return
  }
  if (!app.mazeRuntime) {
    options.showToast('No maze to export.')
    return
  }

  exportSvgOption.disabled = app.view3d
  if (app.view3d && getExportFormat() === 'svg') {
    exportFormatSelect.value = 'png'
  }
  syncExportFields()
  exportDialog.classList.remove('is-hidden')
  exportFormatSelect.focus()
}

function closeExportDialog(): void {
  if (exporting) {
    return
  }
  exportDialog.classList.add('is-hidden')
  exportButton.focus()
}

function syncExportFields(): void {
  const format = getExportFormat()
  const vector = format === 'svg'
  const lossy = format === 'jpeg' || format === 'webp'
  const jpeg = format === 'jpeg'

  exportBackgroundField.classList.toggle('is-hidden', vector)
  exportQualityField.classList.toggle('is-hidden', !lossy)
  exportBackgroundSelect.disabled = jpeg
  if (jpeg) {
    exportBackgroundSelect.value = 'as-shown'
  }
  exportQualityLabel.value = `${exportQualityRange.value}%`

  if (vector) {
    exportMeta.textContent = '2D vector maze · independent of viewport size'
    return
  }
  const { height, width } = getEstimatedCaptureSize()
  const viewLabel = app.view3d ? '3D current view' : '2D current view'
  exportMeta.textContent = `${viewLabel} · ${width} × ${height} px`
}

async function exportCurrentView(options: ImageExportOptions): Promise<void> {
  if (exporting) {
    return
  }

  const format = getExportFormat()
  if (format === 'svg') {
    options.exportSvg()
    closeExportDialog()
    return
  }

  exporting = true
  exportDownloadButton.disabled = true
  let completed = false
  try {
    const source = await getCaptureSource()
    render()
    const normalized = normalizeRasterExportOptions({
      background: getExportBackground(),
      format,
      quality: Number(exportQualityRange.value) / 100,
    })
    const styles = getComputedStyle(canvasWrap)
    const canvas = captureViewport({
      background: normalized.background,
      backgroundColor: styles.backgroundColor,
      gridColor: styles.getPropertyValue('--workspace-grid').trim() || 'rgba(255, 255, 255, 0.015)',
      gridSizeCssPx: 40,
      source,
      viewportCssWidth: canvasWrap.getBoundingClientRect().width,
    })
    const blob = await encodeRasterImage(canvas, normalized)
    const maze = app.activeTab === 'generate' && app.generationPreview
      ? app.generationPreview.view
      : app.maze
    downloadBlob(buildExportFilename(maze.cols, maze.rows, format), blob)
    completed = true
    options.showToast(`${format.toUpperCase()} exported.`)
  }
  catch (error) {
    options.showToast(error instanceof Error ? error.message : 'Image export failed.')
  }
  finally {
    exporting = false
    exportDownloadButton.disabled = false
    if (completed) {
      closeExportDialog()
    }
  }
}

async function getCaptureSource(): Promise<ViewportCaptureSource> {
  return app.view3d ? ensureThreeView() : ensureWebgl2dView()
}

function getEstimatedCaptureSize(): { height: number, width: number } {
  const source = app.view3d ? app.threeView : app.webgl2dView
  if (source) {
    return source.getCaptureSize()
  }
  const rect = canvasWrap.getBoundingClientRect()
  const ratio = getViewportPixelRatio()
  return {
    height: Math.max(1, Math.round(rect.height * ratio)),
    width: Math.max(1, Math.round(rect.width * ratio)),
  }
}

function getExportFormat(): ImageExportFormat {
  const value = exportFormatSelect.value as ImageExportFormat
  return IMAGE_EXPORT_FORMATS.has(value) ? value : 'png'
}

function getExportBackground(): ExportBackground {
  return exportBackgroundSelect.value === 'transparent' ? 'transparent' : 'as-shown'
}
