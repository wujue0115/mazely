import type { GridCell } from 'mazely'
import * as THREE from 'three'
import { getCellPolygon } from './grid-geometry'

/** Fixed polar tiles; playback changes colors without rebuilding vertices. */
export class CircularCellGeometry extends THREE.BufferGeometry {
  private readonly ranges: Array<{ cell: GridCell, start: number, count: number, color: string | null }> = []

  constructor(cells: GridCell[], plane: 'xy' | 'xz') {
    super()
    const positions: number[] = []
    for (const cell of cells) {
      const start = positions.length / 3
      const polygon = getCellPolygon(cell)
      for (let index = 1; index < polygon.length - 1; index += 1) {
        for (const point of [polygon[0], polygon[index], polygon[index + 1]]) {
          positions.push(...(plane === 'xy' ? [point.x, -point.y, 0] : [point.x, 0, point.y]))
        }
      }
      this.ranges.push({ cell, start, count: positions.length / 3 - start, color: null })
    }
    this.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    this.setAttribute('color', new THREE.BufferAttribute(new Float32Array(positions.length), 3).setUsage(THREE.DynamicDrawUsage))
    if (plane === 'xz')
      this.computeVertexNormals()
  }

  updateColors(getColor: (x: number, y: number) => string): void {
    const attribute = this.getAttribute('color') as THREE.BufferAttribute
    const color = new THREE.Color()
    let changed = false
    for (const range of this.ranges) {
      const value = getColor(range.cell.col, range.cell.row)
      if (range.color === value)
        continue
      range.color = value
      color.set(value)
      for (let index = range.start; index < range.start + range.count; index += 1) {
        attribute.setXYZ(index, color.r, color.g, color.b)
      }
      attribute.addUpdateRange(range.start * 3, range.count * 3)
      changed = true
    }
    if (changed)
      attribute.needsUpdate = true
  }
}
