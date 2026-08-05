import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildExportFilename,
  captureViewport,
  encodeRasterImage,
  getExportExtension,
  getRasterMimeType,
  normalizeRasterExportOptions,
} from '../src/lib/export-image'

afterEach(() => vi.unstubAllGlobals())

describe('image export formats', () => {
  it('maps formats to download extensions and MIME types', () => {
    expect(getExportExtension('jpeg')).toBe('jpg')
    expect(getExportExtension('png')).toBe('png')
    expect(getExportExtension('svg')).toBe('svg')
    expect(getExportExtension('webp')).toBe('webp')
    expect(getRasterMimeType('jpeg')).toBe('image/jpeg')
    expect(getRasterMimeType('png')).toBe('image/png')
    expect(getRasterMimeType('webp')).toBe('image/webp')
    expect(buildExportFilename(24, 16, 'jpeg')).toBe('mazely-24x16.jpg')
  })

  it('forces an opaque JPEG background and clamps quality', () => {
    expect(normalizeRasterExportOptions({
      background: 'transparent',
      format: 'jpeg',
      quality: 5,
    })).toEqual({
      background: 'as-shown',
      format: 'jpeg',
      quality: 1,
    })

    expect(normalizeRasterExportOptions({
      background: 'transparent',
      format: 'webp',
      quality: 0,
    })).toEqual({
      background: 'transparent',
      format: 'webp',
      quality: 0.1,
    })
  })

  it('composites the scaled workspace background before the current view', () => {
    const fills: Array<{ color: string, height: number, width: number, x: number, y: number }> = []
    const context = {
      fillStyle: '',
      fillRect(x: number, y: number, width: number, height: number) {
        fills.push({ color: this.fillStyle, height, width, x, y })
      },
    } as unknown as CanvasRenderingContext2D
    const output = {
      getContext: () => context,
      height: 0,
      width: 0,
    } as unknown as HTMLCanvasElement
    vi.stubGlobal('document', { createElement: () => output })
    const captureTo = vi.fn()

    const result = captureViewport({
      background: 'as-shown',
      backgroundColor: '#111317',
      gridColor: 'rgba(255, 255, 255, 0.015)',
      gridSizeCssPx: 40,
      source: {
        captureTo,
        getCaptureSize: () => ({ height: 100, width: 200 }),
      },
      viewportCssWidth: 100,
    })

    expect(result).toBe(output)
    expect(output).toMatchObject({ height: 100, width: 200 })
    expect(fills[0]).toEqual({ color: '#111317', height: 100, width: 200, x: 0, y: 0 })
    expect(fills[1]).toMatchObject({ color: 'rgba(255, 255, 255, 0.015)', width: 2, x: 0 })
    expect(captureTo).toHaveBeenCalledWith(context)
  })

  it('passes lossy quality to the browser encoder', async () => {
    const toBlob = vi.fn((callback: BlobCallback, type?: string, quality?: number) => {
      callback(new Blob(['image'], { type }))
      expect(quality).toBe(0.72)
    })
    const canvas = { toBlob } as unknown as HTMLCanvasElement

    await expect(encodeRasterImage(canvas, {
      background: 'as-shown',
      format: 'webp',
      quality: 0.72,
    })).resolves.toMatchObject({ type: 'image/webp' })
    expect(toBlob).toHaveBeenCalledOnce()
  })

  it('rejects silent browser fallback to another image type', async () => {
    const canvas = {
      toBlob(callback: BlobCallback) {
        callback(new Blob(['fallback'], { type: 'image/png' }))
      },
    } as unknown as HTMLCanvasElement

    await expect(encodeRasterImage(canvas, {
      background: 'as-shown',
      format: 'webp',
      quality: 0.9,
    })).rejects.toThrow('WEBP export is not supported')
  })
})
