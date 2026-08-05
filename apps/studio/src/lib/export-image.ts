import { clamp } from './utils'

export type RasterExportFormat = 'jpeg' | 'png' | 'webp'
export type ImageExportFormat = RasterExportFormat | 'svg'
export type ExportBackground = 'as-shown' | 'transparent'

export interface ViewportCaptureSource {
  captureTo: (context: CanvasRenderingContext2D) => void
  getCaptureSize: () => { height: number, width: number }
}

export interface RasterExportOptions {
  background: ExportBackground
  format: RasterExportFormat
  quality: number
}

const RASTER_MIME_TYPES: Record<RasterExportFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

export function getExportExtension(format: ImageExportFormat): string {
  return format === 'jpeg' ? 'jpg' : format
}

export function getRasterMimeType(format: RasterExportFormat): string {
  return RASTER_MIME_TYPES[format]
}

export function normalizeRasterExportOptions(options: RasterExportOptions): RasterExportOptions {
  return {
    background: options.format === 'jpeg' ? 'as-shown' : options.background,
    format: options.format,
    quality: clamp(options.quality, 0.1, 1),
  }
}

export function buildExportFilename(cols: number, rows: number, format: ImageExportFormat): string {
  return `mazely-${cols}x${rows}.${getExportExtension(format)}`
}

export function captureViewport(options: {
  background: ExportBackground
  backgroundColor: string
  gridColor: string
  gridSizeCssPx: number
  source: ViewportCaptureSource
  viewportCssWidth: number
}): HTMLCanvasElement {
  const { height, width } = options.source.getCaptureSize()
  if (width <= 0 || height <= 0) {
    throw new Error('The current view has no drawable area.')
  }

  const output = document.createElement('canvas')
  output.width = width
  output.height = height
  const context = output.getContext('2d')
  if (!context) {
    throw new Error('Image export is unavailable in this browser.')
  }

  if (options.background === 'as-shown') {
    const pixelScale = width / Math.max(1, options.viewportCssWidth)
    drawWorkspaceBackground({
      backgroundColor: options.backgroundColor,
      context,
      gridColor: options.gridColor,
      gridLineWidth: pixelScale,
      gridSize: options.gridSizeCssPx * pixelScale,
      height,
      width,
    })
  }
  options.source.captureTo(context)
  return output
}

export function encodeRasterImage(
  canvas: HTMLCanvasElement,
  options: RasterExportOptions,
): Promise<Blob> {
  const normalized = normalizeRasterExportOptions(options)
  const mimeType = getRasterMimeType(normalized.format)
  const quality = normalized.format === 'png' ? undefined : normalized.quality

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(`Could not encode ${normalized.format.toUpperCase()}.`))
        return
      }
      if (blob.type && blob.type !== mimeType) {
        reject(new Error(`${normalized.format.toUpperCase()} export is not supported by this browser.`))
        return
      }
      resolve(blob)
    }, mimeType, quality)
  })
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function drawWorkspaceBackground(options: {
  backgroundColor: string
  context: CanvasRenderingContext2D
  gridColor: string
  gridLineWidth: number
  gridSize: number
  height: number
  width: number
}): void {
  const { context, height, width } = options
  context.fillStyle = options.backgroundColor
  context.fillRect(0, 0, width, height)

  const gridSize = Math.max(1, options.gridSize)
  const gridLineWidth = Math.max(1, options.gridLineWidth)
  context.fillStyle = options.gridColor
  for (let x = 0; x < width; x += gridSize) {
    context.fillRect(Math.round(x), 0, gridLineWidth, height)
  }
  for (let y = 0; y < height; y += gridSize) {
    context.fillRect(0, Math.round(y), width, gridLineWidth)
  }
}
