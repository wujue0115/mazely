import type { Maze } from 'mazely'
import type { MazePoint } from './maze-types'
import * as THREE from 'three'
import { countSquareGridLines, visitSquareGridLines } from './runtime'
import { FIXED_CELL_SIZE } from './types'
import { getViewportPixelRatio } from './utils'

export interface Webgl2dOverlaySegment {
  from: MazePoint
  to: MazePoint
  color: string
  width: number
}

export interface Webgl2dOverlayDot {
  point: MazePoint
  color: string
  radius: number
}

export interface Webgl2dOverlayRing {
  point: MazePoint
  color: string
  radius: number
}

export interface Webgl2dViewState {
  runtime: Maze
  wallThickness: number
  wallRevision: number
  wallsVisible: boolean
  wallColor: string
  getCellColor: (x: number, y: number) => string
  gridColor: string
  gridVisible: boolean
  gridWidth: number
  cellKey: string
  segments: Webgl2dOverlaySegment[]
  dots: Webgl2dOverlayDot[]
  rings: Webgl2dOverlayRing[]
  hintSegments: Webgl2dOverlaySegment[]
  hintBorderSegments: Webgl2dOverlaySegment[]
  hintDots: Webgl2dOverlayDot[]
  hintRings: Webgl2dOverlayRing[]
  overlayKey: string
  start: MazePoint | null
  startColor: string
  end: MazePoint | null
  endColor: string
  zoom: number
  panX: number
  panY: number
  viewportWidth: number
  viewportHeight: number
}

const CELL_Z = 0
const WALL_Z = 0.01
const GRID_Z = WALL_Z + 0.001
const LINE_Z = 0.02
const DOT_Z = 0.03
const HINT_FILL_Z = 0.045
const HINT_BORDER_Z = 0.055
const START_END_POINT_Z = 0.04
const RING_Z = 0.06

export class Webgl2dMazeView {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  private readonly mazeGroup = new THREE.Group()
  private readonly container: HTMLElement
  private readonly quadGeometry = new THREE.PlaneGeometry(1, 1)
  private readonly discGeometry = new THREE.CircleGeometry(1, 24)
  private readonly ringGeometry = new THREE.RingGeometry(0.86, 1, 32)
  private readonly cellMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly gridMaterial = new THREE.MeshBasicMaterial({
    depthWrite: false,
    opacity: 0.58,
    side: THREE.DoubleSide,
    transparent: true,
  })

  private readonly wallMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly overlayLineMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly overlayDotMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly overlayRingMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly hintLineMaterial = new THREE.MeshBasicMaterial({ opacity: 0.28, side: THREE.DoubleSide, transparent: true })
  private readonly hintBorderMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly hintDotMaterial = new THREE.MeshBasicMaterial({ opacity: 0.28, side: THREE.DoubleSide, transparent: true })
  private readonly hintRingMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly startMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  private readonly endMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })

  private cellMesh: THREE.InstancedMesh | null = null
  private gridMesh: THREE.Mesh | null = null
  private gridRuntime: Maze | null = null
  private gridWidth = 0
  private wallMesh: THREE.InstancedMesh | null = null
  private overlayLineMesh: THREE.InstancedMesh | null = null
  private overlayDotMesh: THREE.InstancedMesh | null = null
  private overlayRingMesh: THREE.InstancedMesh | null = null
  private hintLineMesh: THREE.InstancedMesh | null = null
  private hintBorderMesh: THREE.InstancedMesh | null = null
  private hintDotMesh: THREE.InstancedMesh | null = null
  private hintRingMesh: THREE.InstancedMesh | null = null
  private readonly startMesh = new THREE.Mesh(this.discGeometry, this.startMaterial)
  private readonly endMesh = new THREE.Mesh(this.discGeometry, this.endMaterial)
  private cellRuntime: Maze | null = null
  private wallRuntime: Maze | null = null
  private lastWallKey = ''
  private lastCellKey = ''
  private lastOverlayKey = ''
  private visible = false

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false })
    this.renderer.setPixelRatio(getViewportPixelRatio())
    this.renderer.domElement.classList.add('three-canvas')
    this.renderer.domElement.style.display = 'none'
    container.appendChild(this.renderer.domElement)

    this.camera.position.set(0, 0, 1)
    this.camera.lookAt(0, 0, 0)
    this.scene.add(this.mazeGroup)
    this.mazeGroup.add(this.startMesh, this.endMesh)
    this.resize()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.renderer.domElement.style.display = visible ? 'block' : 'none'
    if (visible) {
      this.resize()
      this.renderFrame()
    }
  }

  resize(): void {
    const rect = this.container.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    if (width <= 0 || height <= 0) {
      return
    }
    this.renderer.setPixelRatio(getViewportPixelRatio())
    this.renderer.setSize(width, height, true)
    this.renderFrame()
  }

  sync(state: Webgl2dViewState): void {
    const { cols, rows } = state.runtime.grid
    this.ensureCellMesh(state.runtime.grid.cells.length)
    this.ensureWallMesh(rows * (cols + 1) + cols * (rows + 1))
    this.syncCamera(state, cols, rows)
    this.syncCellsIfNeeded(state)
    this.syncGrid(state)
    this.syncWallsIfNeeded(state)
    this.syncMarkers(state)
    this.syncOverlaysIfNeeded(state)
    this.renderFrame()
  }

  private syncCamera(state: Webgl2dViewState, cols: number, rows: number): void {
    const worldWidth = state.viewportWidth / state.zoom
    const worldHeight = state.viewportHeight / state.zoom
    const mazePixelWidth = cols * FIXED_CELL_SIZE
    const mazePixelHeight = rows * FIXED_CELL_SIZE
    const offsetX = (state.viewportWidth - mazePixelWidth) / 2
    const offsetY = (state.viewportHeight - mazePixelHeight) / 2
    const worldWidthCells = worldWidth / FIXED_CELL_SIZE
    const worldHeightCells = worldHeight / FIXED_CELL_SIZE
    const left = ((0 - state.panX) / state.zoom - offsetX) / FIXED_CELL_SIZE
    const top = ((0 - state.panY) / state.zoom - offsetY) / FIXED_CELL_SIZE
    const centerX = left + worldWidthCells / 2
    const centerY = -top - worldHeightCells / 2

    this.camera.left = -worldWidthCells / 2
    this.camera.right = worldWidthCells / 2
    this.camera.top = worldHeightCells / 2
    this.camera.bottom = -worldHeightCells / 2
    this.camera.position.set(centerX, centerY, 1)
    this.camera.updateProjectionMatrix()
  }

  private ensureCellMesh(capacity: number): void {
    if (this.cellMesh && this.cellMesh.instanceMatrix.count >= capacity) {
      return
    }
    if (this.cellMesh) {
      this.mazeGroup.remove(this.cellMesh)
      this.cellMesh.dispose()
    }
    this.cellMesh = new THREE.InstancedMesh(this.quadGeometry, this.cellMaterial, capacity)
    this.cellMesh.frustumCulled = false
    this.mazeGroup.add(this.cellMesh)
    this.lastCellKey = ''
  }

  private ensureWallMesh(capacity: number): void {
    if (this.wallMesh && this.wallMesh.instanceMatrix.count >= capacity) {
      return
    }
    if (this.wallMesh) {
      this.mazeGroup.remove(this.wallMesh)
      this.wallMesh.dispose()
    }
    this.wallMesh = new THREE.InstancedMesh(this.quadGeometry, this.wallMaterial, capacity)
    this.wallMesh.frustumCulled = false
    this.mazeGroup.add(this.wallMesh)
    this.lastWallKey = ''
  }

  private syncGrid(state: Webgl2dViewState): void {
    if (this.gridRuntime !== state.runtime || this.gridWidth !== state.gridWidth) {
      if (this.gridMesh) {
        this.mazeGroup.remove(this.gridMesh)
        this.gridMesh.geometry.dispose()
      }

      const positions = new Float32Array(countSquareGridLines(state.runtime) * 18)
      let offset = 0
      visitSquareGridLines(state.runtime, (fromX, fromY, toX, toY) => {
        const startY = -fromY
        const endY = -toY
        const dx = toX - fromX
        const dy = endY - startY
        const length = Math.hypot(dx, dy)
        const nx = (-dy / length) * state.gridWidth / 2
        const ny = (dx / length) * state.gridWidth / 2
        const vertices = [
          fromX + nx,
          startY + ny,
          fromX - nx,
          startY - ny,
          toX + nx,
          endY + ny,
          fromX - nx,
          startY - ny,
          toX - nx,
          endY - ny,
          toX + nx,
          endY + ny,
        ]
        for (let index = 0; index < vertices.length; index += 2) {
          positions[offset++] = vertices[index]
          positions[offset++] = vertices[index + 1]
          positions[offset++] = GRID_Z
        }
      })
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      this.gridMesh = new THREE.Mesh(geometry, this.gridMaterial)
      this.gridMesh.frustumCulled = false
      this.gridMesh.renderOrder = 1
      this.mazeGroup.add(this.gridMesh)
      this.gridRuntime = state.runtime
      this.gridWidth = state.gridWidth
    }

    if (this.gridMesh) {
      this.gridMesh.visible = state.gridVisible
      this.gridMaterial.color.set(state.gridColor)
    }
  }

  private syncCellsIfNeeded(state: Webgl2dViewState): void {
    if (this.cellRuntime === state.runtime && this.lastCellKey === state.cellKey) {
      return
    }
    this.cellRuntime = state.runtime
    this.lastCellKey = state.cellKey

    const mesh = this.cellMesh!
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    let index = 0
    for (const cell of state.runtime.grid.cells) {
      matrix.makeScale(1, 1, 1)
      matrix.setPosition(cell.col + 0.5, -cell.row - 0.5, CELL_Z)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.set(state.getCellColor(cell.col, cell.row)))
      index += 1
    }
    mesh.count = index
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }

  private syncWallsIfNeeded(state: Webgl2dViewState): void {
    const runtimeState = state.runtime.getState()
    const wallKey = [
      runtimeState.phase,
      runtimeState.index,
      runtimeState.done,
      state.wallThickness,
      state.wallColor,
      state.wallRevision,
      state.wallsVisible,
      state.runtime.grid.rows,
      state.runtime.grid.cols,
    ].join('|')
    if (this.wallRuntime === state.runtime && this.lastWallKey === wallKey) {
      return
    }
    this.wallRuntime = state.runtime
    this.lastWallKey = wallKey

    const mesh = this.wallMesh!
    if (!state.wallsVisible) {
      mesh.count = 0
      this.lastWallKey = wallKey
      return
    }
    const matrix = new THREE.Matrix4()
    const thickness = state.wallThickness
    let index = 0
    const addWall = (x: number, y: number, width: number, height: number): void => {
      matrix.makeScale(width, height, 1)
      matrix.setPosition(x, y, WALL_Z)
      mesh.setMatrixAt(index, matrix)
      index += 1
    }

    for (const cell of state.runtime.grid.cells) {
      const x = cell.col
      const y = -cell.row
      if (!cell.edges.top?.opened)
        addWall(x + 0.5, y, 1 + thickness, thickness)
      if (!cell.edges.left?.opened)
        addWall(x, y - 0.5, thickness, 1 + thickness)
      if (!cell.edges.bottom)
        addWall(x + 0.5, y - 1, 1 + thickness, thickness)
      if (!cell.edges.right)
        addWall(x + 1, y - 0.5, thickness, 1 + thickness)
    }

    mesh.count = index
    this.wallMaterial.color.set(state.wallColor)
    mesh.instanceMatrix.needsUpdate = true
  }

  private syncMarkers(state: Webgl2dViewState): void {
    this.startMesh.visible = state.start !== null
    if (state.start) {
      this.startMesh.position.set(state.start.x + 0.5, -state.start.y - 0.5, START_END_POINT_Z)
      this.startMesh.scale.setScalar(0.25)
      this.startMaterial.color.set(state.startColor)
    }

    this.endMesh.visible = state.end !== null
    if (state.end) {
      this.endMesh.position.set(state.end.x + 0.5, -state.end.y - 0.5, START_END_POINT_Z)
      this.endMesh.scale.setScalar(0.25)
      this.endMaterial.color.set(state.endColor)
    }
  }

  private syncOverlaysIfNeeded(state: Webgl2dViewState): void {
    if (this.lastOverlayKey === state.overlayKey) {
      return
    }
    this.lastOverlayKey = state.overlayKey

    this.ensureOverlayMeshes(state)
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()

    const lineMesh = this.overlayLineMesh
    if (lineMesh) {
      let index = 0
      for (const segment of state.segments) {
        const dx = segment.to.x - segment.from.x
        const dy = segment.to.y - segment.from.y
        const centerX = (segment.from.x + segment.to.x) / 2 + 0.5
        const centerY = -((segment.from.y + segment.to.y) / 2 + 0.5)
        if (dy === 0) {
          matrix.makeScale(Math.abs(dx) + segment.width, segment.width, 1)
        }
        else {
          matrix.makeScale(segment.width, Math.abs(dy) + segment.width, 1)
        }
        matrix.setPosition(centerX, centerY, LINE_Z)
        lineMesh.setMatrixAt(index, matrix)
        lineMesh.setColorAt(index, color.set(segment.color))
        index += 1
      }
      lineMesh.count = index
      lineMesh.instanceMatrix.needsUpdate = true
      if (lineMesh.instanceColor) {
        lineMesh.instanceColor.needsUpdate = true
      }
    }

    const dotMesh = this.overlayDotMesh
    if (dotMesh) {
      let index = 0
      for (const dot of state.dots) {
        matrix.makeScale(dot.radius, dot.radius, 1)
        matrix.setPosition(dot.point.x + 0.5, -dot.point.y - 0.5, DOT_Z)
        dotMesh.setMatrixAt(index, matrix)
        dotMesh.setColorAt(index, color.set(dot.color))
        index += 1
      }
      dotMesh.count = index
      dotMesh.instanceMatrix.needsUpdate = true
      if (dotMesh.instanceColor) {
        dotMesh.instanceColor.needsUpdate = true
      }
    }

    const ringMesh = this.overlayRingMesh
    if (ringMesh) {
      let index = 0
      for (const ring of state.rings) {
        matrix.makeScale(ring.radius, ring.radius, 1)
        matrix.setPosition(ring.point.x + 0.5, -ring.point.y - 0.5, RING_Z)
        ringMesh.setMatrixAt(index, matrix)
        ringMesh.setColorAt(index, color.set(ring.color))
        index += 1
      }
      ringMesh.count = index
      ringMesh.instanceMatrix.needsUpdate = true
      if (ringMesh.instanceColor) {
        ringMesh.instanceColor.needsUpdate = true
      }
    }

    this.syncHintSegments(state.hintSegments, this.hintLineMesh, HINT_FILL_Z)
    this.syncHintSegments(state.hintBorderSegments, this.hintBorderMesh, HINT_BORDER_Z)
    this.syncHintDots(state.hintDots, this.hintDotMesh, HINT_FILL_Z)
    this.syncHintRings(state.hintRings, this.hintRingMesh)
  }

  private syncHintSegments(segments: Webgl2dOverlaySegment[], mesh: THREE.InstancedMesh | null, z: number): void {
    if (!mesh) {
      return
    }

    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    let index = 0
    for (const segment of segments) {
      const dx = segment.to.x - segment.from.x
      const dy = segment.to.y - segment.from.y
      const centerX = (segment.from.x + segment.to.x) / 2 + 0.5
      const centerY = -((segment.from.y + segment.to.y) / 2 + 0.5)
      if (dy === 0) {
        matrix.makeScale(Math.abs(dx) + segment.width, segment.width, 1)
      }
      else {
        matrix.makeScale(segment.width, Math.abs(dy) + segment.width, 1)
      }
      matrix.setPosition(centerX, centerY, z)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.set(segment.color))
      index += 1
    }
    mesh.count = index
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }

  private syncHintDots(dots: Webgl2dOverlayDot[], mesh: THREE.InstancedMesh | null, z: number): void {
    if (!mesh) {
      return
    }

    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    let index = 0
    for (const dot of dots) {
      matrix.makeScale(dot.radius, dot.radius, 1)
      matrix.setPosition(dot.point.x + 0.5, -dot.point.y - 0.5, z)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.set(dot.color))
      index += 1
    }
    mesh.count = index
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }

  private syncHintRings(rings: Webgl2dOverlayRing[], mesh: THREE.InstancedMesh | null): void {
    if (!mesh) {
      return
    }

    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    let index = 0
    for (const ring of rings) {
      matrix.makeScale(ring.radius, ring.radius, 1)
      matrix.setPosition(ring.point.x + 0.5, -ring.point.y - 0.5, RING_Z)
      mesh.setMatrixAt(index, matrix)
      mesh.setColorAt(index, color.set(ring.color))
      index += 1
    }
    mesh.count = index
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  }

  private ensureOverlayMeshes(state: Webgl2dViewState): void {
    const lineCapacity = state.segments.length
    const dotCapacity = state.dots.length
    const ringCapacity = state.rings.length
    const hintLineCapacity = state.hintSegments.length
    const hintBorderCapacity = state.hintBorderSegments.length
    const hintDotCapacity = state.hintDots.length
    const hintRingCapacity = state.hintRings.length

    if (lineCapacity > 0 && (!this.overlayLineMesh || this.overlayLineMesh.instanceMatrix.count < lineCapacity)) {
      if (this.overlayLineMesh) {
        this.mazeGroup.remove(this.overlayLineMesh)
        this.overlayLineMesh.dispose()
      }
      this.overlayLineMesh = new THREE.InstancedMesh(this.quadGeometry, this.overlayLineMaterial, Math.ceil(lineCapacity * 1.5))
      this.overlayLineMesh.frustumCulled = false
      this.mazeGroup.add(this.overlayLineMesh)
      this.lastOverlayKey = ''
    }
    if (this.overlayLineMesh && lineCapacity === 0) {
      this.overlayLineMesh.count = 0
    }

    if (dotCapacity > 0 && (!this.overlayDotMesh || this.overlayDotMesh.instanceMatrix.count < dotCapacity)) {
      if (this.overlayDotMesh) {
        this.mazeGroup.remove(this.overlayDotMesh)
        this.overlayDotMesh.dispose()
      }
      this.overlayDotMesh = new THREE.InstancedMesh(this.discGeometry, this.overlayDotMaterial, Math.ceil(dotCapacity * 1.5))
      this.overlayDotMesh.frustumCulled = false
      this.mazeGroup.add(this.overlayDotMesh)
      this.lastOverlayKey = ''
    }
    if (this.overlayDotMesh && dotCapacity === 0) {
      this.overlayDotMesh.count = 0
    }

    if (ringCapacity > 0 && (!this.overlayRingMesh || this.overlayRingMesh.instanceMatrix.count < ringCapacity)) {
      if (this.overlayRingMesh) {
        this.mazeGroup.remove(this.overlayRingMesh)
        this.overlayRingMesh.dispose()
      }
      this.overlayRingMesh = new THREE.InstancedMesh(this.ringGeometry, this.overlayRingMaterial, Math.ceil(ringCapacity * 1.5))
      this.overlayRingMesh.frustumCulled = false
      this.mazeGroup.add(this.overlayRingMesh)
      this.lastOverlayKey = ''
    }
    if (this.overlayRingMesh && ringCapacity === 0) {
      this.overlayRingMesh.count = 0
    }

    this.hintLineMesh = this.ensureHintMesh(
      this.hintLineMesh,
      hintLineCapacity,
      this.quadGeometry,
      this.hintLineMaterial,
    )
    this.hintBorderMesh = this.ensureHintMesh(
      this.hintBorderMesh,
      hintBorderCapacity,
      this.quadGeometry,
      this.hintBorderMaterial,
    )
    this.hintDotMesh = this.ensureHintMesh(
      this.hintDotMesh,
      hintDotCapacity,
      this.discGeometry,
      this.hintDotMaterial,
    )
    this.hintRingMesh = this.ensureHintMesh(
      this.hintRingMesh,
      hintRingCapacity,
      this.ringGeometry,
      this.hintRingMaterial,
    )
  }

  private ensureHintMesh(
    current: THREE.InstancedMesh | null,
    capacity: number,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
  ): THREE.InstancedMesh | null {
    if (capacity === 0) {
      if (current) {
        current.count = 0
      }
      return current
    }

    if (current && current.instanceMatrix.count >= capacity) {
      return current
    }

    if (current) {
      this.mazeGroup.remove(current)
      current.dispose()
    }

    const mesh = new THREE.InstancedMesh(geometry, material, Math.ceil(capacity * 1.5))
    mesh.frustumCulled = false
    this.mazeGroup.add(mesh)
    this.lastOverlayKey = ''
    return mesh
  }

  private renderFrame(): void {
    if (!this.visible) {
      return
    }
    this.renderer.render(this.scene, this.camera)
  }
}
