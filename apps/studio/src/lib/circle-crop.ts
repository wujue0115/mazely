export interface CircleCrop { x: number, y: number, size: number }
export interface CropPoint { x: number, y: number }
export type CircleCropHandle = 'nw' | 'ne' | 'sw' | 'se' | 'move'

export function createCircleCrop(width: number, height: number): CircleCrop {
  const size = Math.min(width, height)
  return { x: (width - size) / 2, y: (height - size) / 2, size }
}

export function getCircleCropCorners(crop: CircleCrop): Array<{ handle: Exclude<CircleCropHandle, 'move'>, point: CropPoint }> {
  return [
    { handle: 'nw', point: { x: crop.x, y: crop.y } },
    { handle: 'ne', point: { x: crop.x + crop.size, y: crop.y } },
    { handle: 'sw', point: { x: crop.x, y: crop.y + crop.size } },
    { handle: 'se', point: { x: crop.x + crop.size, y: crop.y + crop.size } },
  ]
}

export function hitCircleCrop(crop: CircleCrop, point: CropPoint, tolerance: number): CircleCropHandle | null {
  for (const corner of getCircleCropCorners(crop)) {
    if (Math.abs(point.x - corner.point.x) <= tolerance && Math.abs(point.y - corner.point.y) <= tolerance)
      return corner.handle
  }
  return Math.hypot(point.x - crop.x - crop.size / 2, point.y - crop.y - crop.size / 2) <= crop.size / 2 ? 'move' : null
}

export function dragCircleCrop(crop: CircleCrop, handle: CircleCropHandle, start: CropPoint, point: CropPoint, width: number, height: number): CircleCrop {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
  if (handle === 'move') {
    return { ...crop, x: clamp(crop.x + point.x - start.x, 0, width - crop.size), y: clamp(crop.y + point.y - start.y, 0, height - crop.size) }
  }
  const sx = handle.endsWith('e') ? 1 : -1
  const sy = handle.startsWith('s') ? 1 : -1
  const anchorX = crop.x + (sx < 0 ? crop.size : 0)
  const anchorY = crop.y + (sy < 0 ? crop.size : 0)
  const maximum = Math.min(sx > 0 ? width - anchorX : anchorX, sy > 0 ? height - anchorY : anchorY)
  const size = clamp(Math.max(sx * (point.x - anchorX), sy * (point.y - anchorY)), Math.min(16, maximum), maximum)
  return { x: sx > 0 ? anchorX : anchorX - size, y: sy > 0 ? anchorY : anchorY - size, size }
}
