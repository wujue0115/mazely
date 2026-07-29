import type { Maze } from 'mazely'
import type { MazePoint } from './maze-types'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { countSquareGridLines, visitSquareGridLines } from './runtime'
import {
  BASE_WHEEL_ZOOM_STEP,
  clamp,
  getMazeScaledWheelZoomStep,
  getViewportPixelRatio,
} from './utils'

/** Grid-adjacent line segment drawn flat on the floor (2D trail/path lines). */
export interface ThreeOverlaySegment {
  from: MazePoint
  to: MazePoint
  color: string
  /** Line width in world units (1 unit = one cell). */
  width: number
}

/** Flat marker disc on the floor (2D head/frontier circles). */
export interface ThreeOverlayDot {
  point: MazePoint
  color: string
  /** Radius in world units. */
  radius: number
}

export interface ThreeViewSyncState {
  runtime: Maze
  /** Wall height in world units (1 unit = one cell). */
  wallHeight: number
  /** Wall thickness in world units. */
  wallThickness: number
  wallsVisible: boolean
  wallColor: string
  getCellColor: (x: number, y: number) => string
  gridColor: string
  gridVisible: boolean
  gridWidth: number
  segments: ThreeOverlaySegment[]
  dots: ThreeOverlayDot[]
  start: MazePoint | null
  startColor: string
  end: MazePoint | null
  endColor: string
}

interface PointerClientPosition {
  clientX: number
  clientY: number
}

const FLOOR_DEPTH = 0.08
const GRID_Y_OFFSET = 0.001
const MIN_WALL_HEIGHT = 0.02
// Overlays mimic the flat 2D canvas: thin plates just above the floor,
// stacked so lines sit under dots, which sit under start/end discs.
const OVERLAY_LINE_HEIGHT = 0.03
const OVERLAY_LINE_Y = 0.02
const OVERLAY_DOT_HEIGHT = 0.03
const OVERLAY_DOT_Y = 0.045
const START_END_POINT_DISC_HEIGHT = 0.04
const START_END_POINT_DISC_Y = 0.07
const DESKTOP_FIT_VIEW_SCALE = 0.75
const MOBILE_FIT_VIEW_SCALE = 0.8
const MOBILE_VIEWPORT_WIDTH = 767
const ORBIT_ROTATE_SPEED = 0.005

/**
 * Real-3D maze renderer: walls are extruded boxes on top of a colored floor
 * grid. Instanced meshes keep large mazes cheap; rendering is on demand
 * (after sync and on camera interaction).
 */
export class ThreeMazeView {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera: THREE.PerspectiveCamera
  private readonly controls: OrbitControls
  private readonly raycaster = new THREE.Raycaster()
  private readonly pointerNdc = new THREE.Vector2()
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly dragGroundPoint = new THREE.Vector3()
  private readonly currentGroundPoint = new THREE.Vector3()
  private readonly mazeGroup = new THREE.Group()
  private readonly container: HTMLElement

  private readonly wallMaterial = new THREE.MeshLambertMaterial()
  private readonly floorMaterial = new THREE.MeshLambertMaterial()
  private readonly gridMaterial = new THREE.MeshBasicMaterial({
    depthWrite: false,
    opacity: 0.58,
    side: THREE.DoubleSide,
    transparent: true,
  })

  private readonly boxGeometry = new THREE.BoxGeometry(1, 1, 1)
  // Overlays mirror the 2D canvas trails: flat unlit lines plus flat marker
  // discs, both instanced so per-step rebuilds stay cheap.
  private readonly overlayLineMaterial = new THREE.MeshBasicMaterial()
  private readonly overlayDotMaterial = new THREE.MeshBasicMaterial()
  private readonly discGeometry = new THREE.CylinderGeometry(1, 1, 1, 24)

  private wallMesh: THREE.InstancedMesh | null = null
  private floorMesh: THREE.InstancedMesh | null = null
  private gridMesh: THREE.Mesh | null = null
  private gridRuntime: Maze | null = null
  private gridWidth = 0
  private overlayLineMesh: THREE.InstancedMesh | null = null
  private overlayDotMesh: THREE.InstancedMesh | null = null
  private readonly startMesh: THREE.Mesh
  private readonly endMesh: THREE.Mesh

  private fittedGridKey = ''
  private visible = false
  private gridSpan = 20

  private readonly pressedMoveKeys = new Set<string>()
  private moveFrame = 0
  private lastMoveTimestamp = 0
  private activePanPointerId: number | null = null
  private activeRotatePointerId: number | null = null
  private lastRotatePointerX = 0
  private lastRotatePointerY = 0
  private readonly activeTouchPointers = new Map<number, PointerClientPosition>()
  private touchPinchDistance = 0
  private syncedRows = 0
  private syncedCols = 0

  constructor(container: HTMLElement) {
    this.container = container
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    this.renderer.setPixelRatio(getViewportPixelRatio())
    this.renderer.domElement.classList.add('three-canvas')
    // three.js sets an inline `display` on its canvas, which beats any class
    // rule — visibility must be controlled through the inline style too.
    this.renderer.domElement.style.display = 'none'
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableRotate = false
    this.controls.enableZoom = false
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02
    this.controls.addEventListener('change', () => this.renderFrame())

    this.scene.add(this.mazeGroup)
    this.scene.add(new THREE.AmbientLight(0xFFFFFF, 1.1))
    const sun = new THREE.DirectionalLight(0xFFFFFF, 1.6)
    sun.position.set(6, 14, 8)
    this.scene.add(sun)

    this.startMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, START_END_POINT_DISC_HEIGHT, 24),
      new THREE.MeshBasicMaterial(),
    )
    this.endMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, START_END_POINT_DISC_HEIGHT, 24),
      new THREE.MeshBasicMaterial(),
    )
    this.mazeGroup.add(this.startMesh, this.endMesh)

    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.stopMoving)
    this.renderer.domElement.addEventListener('contextmenu', event => event.preventDefault())
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown, { capture: true })
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove, { capture: true })
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp, { capture: true })
    this.renderer.domElement.addEventListener('pointercancel', this.onPointerUp, { capture: true })

    this.resize()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.renderer.domElement.style.display = visible ? 'block' : 'none'
    if (visible) {
      this.resize()
    }
    else {
      this.stopPointerPan()
      this.stopPointerRotate()
      this.stopMoving()
    }
  }

  resize(): void {
    const rect = this.container.getBoundingClientRect()
    const width = rect.width
    const height = rect.height
    if (width <= 0 || height <= 0) {
      return
    }
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(getViewportPixelRatio())
    this.renderer.setSize(width, height, true)
    this.renderFrame()
  }

  resetCamera(): void {
    if (this.syncedRows > 0 && this.syncedCols > 0) {
      this.fitCameraToMaze(this.syncedRows, this.syncedCols)
    }
    this.renderFrame()
  }

  zoomAt(event: PointerClientPosition, zoomFactor: number): void {
    if (!this.visible || zoomFactor <= 0) {
      return
    }

    const beforeAnchor = new THREE.Vector3()
    const hasAnchor = this.projectPointerToGround(event, beforeAnchor)
    const targetOffset = this.controls.target.clone().sub(this.camera.position)
    const currentDistance = targetOffset.length()
    const nextDistance = clamp(currentDistance / zoomFactor, this.controls.minDistance, this.controls.maxDistance)
    if (nextDistance === currentDistance || currentDistance <= 0) {
      return
    }

    const viewDirection = new THREE.Vector3()
    this.camera.getWorldDirection(viewDirection)
    this.camera.position.add(viewDirection.multiplyScalar(currentDistance - nextDistance))

    if (hasAnchor && this.projectPointerToGround(event, this.currentGroundPoint)) {
      const anchorDelta = beforeAnchor.sub(this.currentGroundPoint)
      this.camera.position.add(anchorDelta)
    }

    this.controls.target.set(0, 0, 0)
    this.renderFrame()
  }

  sync(state: ThreeViewSyncState): void {
    const { rows, cols } = state.runtime.grid
    this.syncedRows = rows
    this.syncedCols = cols
    this.gridSpan = Math.max(rows, cols)
    this.syncControlsToMazeSize(rows, cols)
    this.ensureMeshes(rows, cols)
    this.mazeGroup.position.set(-cols / 2, 0, -rows / 2)
    this.fitCameraIfNeeded(rows, cols)

    this.wallMaterial.color.set(state.wallColor)
    this.syncFloor(state)
    this.syncGrid(state)
    this.syncWalls(state)
    this.syncMarkers(state)
    this.syncOverlays(state)
    this.renderFrame()
  }

  private ensureMeshes(rows: number, cols: number): void {
    const wallCapacity = rows * (cols + 1) + cols * (rows + 1)
    const floorCapacity = rows * cols

    if (!this.wallMesh || this.wallMesh.instanceMatrix.count < wallCapacity) {
      if (this.wallMesh) {
        this.mazeGroup.remove(this.wallMesh)
        this.wallMesh.dispose()
      }
      this.wallMesh = new THREE.InstancedMesh(this.boxGeometry, this.wallMaterial, wallCapacity)
      this.wallMesh.frustumCulled = false
      this.mazeGroup.add(this.wallMesh)
    }

    if (!this.floorMesh || this.floorMesh.instanceMatrix.count < floorCapacity) {
      if (this.floorMesh) {
        this.mazeGroup.remove(this.floorMesh)
        this.floorMesh.dispose()
      }
      this.floorMesh = new THREE.InstancedMesh(this.boxGeometry, this.floorMaterial, floorCapacity)
      this.floorMesh.frustumCulled = false
      this.mazeGroup.add(this.floorMesh)
    }
  }

  private syncFloor(state: ThreeViewSyncState): void {
    const mesh = this.floorMesh!
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    let index = 0

    for (const cell of state.runtime.grid.cells) {
      matrix.makeScale(1, FLOOR_DEPTH, 1)
      matrix.setPosition(cell.col + 0.5, -FLOOR_DEPTH / 2, cell.row + 0.5)
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

  private syncGrid(state: ThreeViewSyncState): void {
    if (this.gridRuntime !== state.runtime || this.gridWidth !== state.gridWidth) {
      if (this.gridMesh) {
        this.mazeGroup.remove(this.gridMesh)
        this.gridMesh.geometry.dispose()
      }

      const positions = new Float32Array(countSquareGridLines(state.runtime) * 18)
      let offset = 0
      visitSquareGridLines(state.runtime, (fromX, fromY, toX, toY) => {
        const dx = toX - fromX
        const dz = toY - fromY
        const length = Math.hypot(dx, dz)
        const nx = (-dz / length) * state.gridWidth / 2
        const nz = (dx / length) * state.gridWidth / 2
        const vertices = [
          fromX + nx,
          fromY + nz,
          fromX - nx,
          fromY - nz,
          toX + nx,
          toY + nz,
          fromX - nx,
          fromY - nz,
          toX - nx,
          toY - nz,
          toX + nx,
          toY + nz,
        ]
        for (let index = 0; index < vertices.length; index += 2) {
          positions[offset++] = vertices[index]
          positions[offset++] = 0
          positions[offset++] = vertices[index + 1]
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
      this.gridMesh.position.y = state.wallHeight + GRID_Y_OFFSET
      this.gridMesh.visible = state.gridVisible
      this.gridMaterial.color.set(state.gridColor)
    }
  }

  private syncWalls(state: ThreeViewSyncState): void {
    const mesh = this.wallMesh!
    if (!state.wallsVisible) {
      mesh.count = 0
      return
    }

    const matrix = new THREE.Matrix4()
    const height = Math.max(state.wallHeight, MIN_WALL_HEIGHT)
    const thickness = state.wallThickness
    let index = 0

    const addHorizontalWall = (x: number, lineZ: number): void => {
      matrix.makeScale(1 + thickness, height, thickness)
      matrix.setPosition(x + 0.5, height / 2, lineZ)
      mesh.setMatrixAt(index, matrix)
      index += 1
    }
    const addVerticalWall = (lineX: number, y: number): void => {
      matrix.makeScale(thickness, height, 1 + thickness)
      matrix.setPosition(lineX, height / 2, y + 0.5)
      mesh.setMatrixAt(index, matrix)
      index += 1
    }

    // Interior closed edges are drawn by the cell on their top/left side; a
    // missing bottom/right edge means a grid or shape-mask boundary, which
    // no neighbor will draw.
    for (const cell of state.runtime.grid.cells) {
      const x = cell.col
      const y = cell.row
      if (!cell.edges.top?.opened) {
        addHorizontalWall(x, y)
      }
      if (!cell.edges.left?.opened) {
        addVerticalWall(x, y)
      }
      if (!cell.edges.bottom) {
        addHorizontalWall(x, y + 1)
      }
      if (!cell.edges.right) {
        addVerticalWall(x + 1, y)
      }
    }

    mesh.count = index
    mesh.instanceMatrix.needsUpdate = true
  }

  private syncMarkers(state: ThreeViewSyncState): void {
    this.startMesh.visible = state.start !== null
    if (state.start) {
      this.startMesh.position.set(state.start.x + 0.5, START_END_POINT_DISC_Y, state.start.y + 0.5)
      ;(this.startMesh.material as THREE.MeshBasicMaterial).color.set(state.startColor)
    }

    this.endMesh.visible = state.end !== null
    if (state.end) {
      this.endMesh.position.set(state.end.x + 0.5, START_END_POINT_DISC_Y, state.end.y + 0.5)
      ;(this.endMesh.material as THREE.MeshBasicMaterial).color.set(state.endColor)
    }
  }

  private ensureOverlayMeshes(lineCapacity: number, dotCapacity: number): void {
    if (lineCapacity > 0 && (!this.overlayLineMesh || this.overlayLineMesh.instanceMatrix.count < lineCapacity)) {
      if (this.overlayLineMesh) {
        this.mazeGroup.remove(this.overlayLineMesh)
        this.overlayLineMesh.dispose()
      }
      this.overlayLineMesh = new THREE.InstancedMesh(this.boxGeometry, this.overlayLineMaterial, Math.ceil(lineCapacity * 1.5))
      this.overlayLineMesh.frustumCulled = false
      this.mazeGroup.add(this.overlayLineMesh)
    }

    if (dotCapacity > 0 && (!this.overlayDotMesh || this.overlayDotMesh.instanceMatrix.count < dotCapacity)) {
      if (this.overlayDotMesh) {
        this.mazeGroup.remove(this.overlayDotMesh)
        this.overlayDotMesh.dispose()
      }
      this.overlayDotMesh = new THREE.InstancedMesh(this.discGeometry, this.overlayDotMaterial, Math.ceil(dotCapacity * 1.5))
      this.overlayDotMesh.frustumCulled = false
      this.mazeGroup.add(this.overlayDotMesh)
    }
  }

  private syncOverlays(state: ThreeViewSyncState): void {
    this.ensureOverlayMeshes(state.segments.length, state.dots.length)

    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    const lineHeight = OVERLAY_LINE_HEIGHT
    const lineY = OVERLAY_LINE_Y

    const lineMesh = this.overlayLineMesh
    if (lineMesh) {
      let index = 0
      for (const segment of state.segments) {
        const dx = segment.to.x - segment.from.x
        const dz = segment.to.y - segment.from.y
        const centerX = (segment.from.x + segment.to.x) / 2 + 0.5
        const centerZ = (segment.from.y + segment.to.y) / 2 + 0.5
        // Segments run between grid-adjacent cells, so they are axis-aligned;
        // extending by the width gives square caps that merge at joints,
        // matching the 2D round line joins closely enough.
        if (dz === 0) {
          matrix.makeScale(Math.abs(dx) + segment.width, lineHeight, segment.width)
        }
        else {
          matrix.makeScale(segment.width, lineHeight, Math.abs(dz) + segment.width)
        }
        matrix.setPosition(centerX, lineY, centerZ)
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
        matrix.makeScale(dot.radius, OVERLAY_DOT_HEIGHT, dot.radius)
        matrix.setPosition(dot.point.x + 0.5, OVERLAY_DOT_Y, dot.point.y + 0.5)
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
  }

  private fitCameraIfNeeded(rows: number, cols: number): void {
    if (this.fittedGridKey !== '') {
      return
    }
    this.fittedGridKey = `${rows}x${cols}`
    this.fitCameraToMaze(rows, cols)
  }

  private fitCameraToMaze(rows: number, cols: number): void {
    this.fittedGridKey = `${rows}x${cols}`
    const distance = this.getFitCameraDistance(rows, cols)
    const direction = new THREE.Vector3(0, 1.05, 0.95).normalize()
    this.camera.position.copy(direction.multiplyScalar(distance))
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  private syncControlsToMazeSize(rows: number, cols: number): void {
    const span = Math.max(rows, cols)
    const fitDistance = this.getFitCameraDistance(rows, cols)
    this.controls.minDistance = Math.max(1, span * 0.08)
    this.controls.maxDistance = Math.max(fitDistance * 8, span * 2)
    this.controls.zoomSpeed = getMazeScaledWheelZoomStep(span) / BASE_WHEEL_ZOOM_STEP
  }

  private getFitCameraDistance(rows: number, cols: number): number {
    const fitViewScale = this.getFitViewScale()
    const verticalFov = THREE.MathUtils.degToRad(this.camera.fov)
    const visibleWorldHeightAtUnitDistance = 2 * Math.tan(verticalFov / 2)
    const visibleWorldWidthAtUnitDistance = visibleWorldHeightAtUnitDistance * this.camera.aspect
    const widthFitDistance = cols / (visibleWorldWidthAtUnitDistance * fitViewScale)
    const heightFitDistance = rows / (visibleWorldHeightAtUnitDistance * fitViewScale)
    return Math.max(widthFitDistance, heightFitDistance, 1)
  }

  private getFitViewScale(): number {
    const width = this.renderer.domElement.getBoundingClientRect().width
    return width <= MOBILE_VIEWPORT_WIDTH ? MOBILE_FIT_VIEW_SCALE : DESKTOP_FIT_VIEW_SCALE
  }

  private renderFrame(): void {
    this.renderer.render(this.scene, this.camera)
  }

  // --- mouse/touch ground panning ---

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.visible) {
      return
    }

    if (event.pointerType === 'touch') {
      this.onTouchPointerDown(event)
      return
    }

    if (event.button === 2 || event.pointerType === 'touch') {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.activeRotatePointerId = event.pointerId
      this.lastRotatePointerX = event.clientX
      this.lastRotatePointerY = event.clientY
      this.controls.enabled = false
      this.renderer.domElement.setPointerCapture(event.pointerId)
      return
    }

    if (event.button === 0 && this.projectPointerToGround(event, this.dragGroundPoint)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.activePanPointerId = event.pointerId
      this.controls.enabled = false
      this.container.classList.add('is-dragging')
      this.renderer.domElement.setPointerCapture(event.pointerId)
    }
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && this.activeTouchPointers.has(event.pointerId)) {
      this.onTouchPointerMove(event)
      return
    }

    if (event.pointerId === this.activeRotatePointerId) {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.rotateAroundMazeCenter(
        event.clientX - this.lastRotatePointerX,
        event.clientY - this.lastRotatePointerY,
      )
      this.lastRotatePointerX = event.clientX
      this.lastRotatePointerY = event.clientY
      return
    }

    if (event.pointerId !== this.activePanPointerId) {
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    if (!this.projectPointerToGround(event, this.currentGroundPoint)) {
      return
    }

    const delta = this.dragGroundPoint.clone().sub(this.currentGroundPoint)
    this.camera.position.add(delta)
    this.controls.target.set(0, 0, 0)
    this.renderFrame()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' && this.activeTouchPointers.has(event.pointerId)) {
      this.onTouchPointerUp(event)
      return
    }

    if (event.pointerId === this.activeRotatePointerId) {
      event.preventDefault()
      event.stopImmediatePropagation()
      this.stopPointerRotate()
      return
    }

    if (event.pointerId !== this.activePanPointerId) {
      return
    }

    event.preventDefault()
    event.stopImmediatePropagation()
    this.stopPointerPan()
  }

  private stopPointerPan(): void {
    if (this.activePanPointerId !== null && this.renderer.domElement.hasPointerCapture(this.activePanPointerId)) {
      this.renderer.domElement.releasePointerCapture(this.activePanPointerId)
    }
    this.activePanPointerId = null
    this.controls.enabled = true
    this.container.classList.remove('is-dragging')
  }

  private stopPointerRotate(): void {
    if (this.activeRotatePointerId !== null && this.renderer.domElement.hasPointerCapture(this.activeRotatePointerId)) {
      this.renderer.domElement.releasePointerCapture(this.activeRotatePointerId)
    }
    this.activeRotatePointerId = null
    this.controls.enabled = true
  }

  private onTouchPointerDown(event: PointerEvent): void {
    event.preventDefault()
    event.stopImmediatePropagation()
    this.activeTouchPointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    })
    this.controls.enabled = false
    this.renderer.domElement.setPointerCapture(event.pointerId)

    if (this.activeTouchPointers.size >= 2) {
      this.activeRotatePointerId = null
      this.startTouchPinch()
      return
    }

    this.activeRotatePointerId = event.pointerId
    this.lastRotatePointerX = event.clientX
    this.lastRotatePointerY = event.clientY
  }

  private onTouchPointerMove(event: PointerEvent): void {
    event.preventDefault()
    event.stopImmediatePropagation()
    this.activeTouchPointers.set(event.pointerId, {
      clientX: event.clientX,
      clientY: event.clientY,
    })

    if (this.activeTouchPointers.size >= 2) {
      this.updateTouchPinch()
      return
    }

    if (event.pointerId !== this.activeRotatePointerId) {
      return
    }

    this.rotateAroundMazeCenter(
      event.clientX - this.lastRotatePointerX,
      event.clientY - this.lastRotatePointerY,
    )
    this.lastRotatePointerX = event.clientX
    this.lastRotatePointerY = event.clientY
  }

  private onTouchPointerUp(event: PointerEvent): void {
    event.preventDefault()
    event.stopImmediatePropagation()
    if (this.renderer.domElement.hasPointerCapture(event.pointerId)) {
      this.renderer.domElement.releasePointerCapture(event.pointerId)
    }
    this.activeTouchPointers.delete(event.pointerId)

    if (this.activeTouchPointers.size >= 2) {
      this.activeRotatePointerId = null
      this.startTouchPinch()
      return
    }

    if (this.activeTouchPointers.size === 1) {
      const [pointerId, pointer] = [...this.activeTouchPointers.entries()][0]
      this.activeRotatePointerId = pointerId
      this.lastRotatePointerX = pointer.clientX
      this.lastRotatePointerY = pointer.clientY
      return
    }

    this.activeRotatePointerId = null
    this.touchPinchDistance = 0
    this.controls.enabled = true
  }

  private startTouchPinch(): void {
    const pointers = this.getFirstTwoTouchPointers()
    if (!pointers) {
      return
    }

    const [a, b] = pointers
    this.touchPinchDistance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
  }

  private updateTouchPinch(): void {
    const pointers = this.getFirstTwoTouchPointers()
    if (!pointers) {
      return
    }

    const [a, b] = pointers
    const nextDistance = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
    if (this.touchPinchDistance <= 0 || nextDistance <= 0) {
      this.startTouchPinch()
      return
    }

    this.zoomAt({
      clientX: (a.clientX + b.clientX) / 2,
      clientY: (a.clientY + b.clientY) / 2,
    }, nextDistance / this.touchPinchDistance)
    this.touchPinchDistance = nextDistance
  }

  private getFirstTwoTouchPointers(): [PointerClientPosition, PointerClientPosition] | null {
    const pointers = [...this.activeTouchPointers.values()]
    if (pointers.length < 2) {
      return null
    }
    return [pointers[0], pointers[1]]
  }

  private projectPointerToGround(event: PointerClientPosition, target: THREE.Vector3): boolean {
    const rect = this.renderer.domElement.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return false
    }

    this.pointerNdc.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -(((event.clientY - rect.top) / rect.height) * 2 - 1),
    )
    this.raycaster.setFromCamera(this.pointerNdc, this.camera)
    return this.raycaster.ray.intersectPlane(this.groundPlane, target) !== null
  }

  private rotateAroundMazeCenter(deltaX: number, deltaY: number): void {
    if (deltaX === 0 && deltaY === 0) {
      return
    }

    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -deltaX * ORBIT_ROTATE_SPEED)
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize()
    const pitch = new THREE.Quaternion().setFromAxisAngle(right, -deltaY * ORBIT_ROTATE_SPEED)
    const rotation = yaw.multiply(pitch)
    const nextPosition = this.camera.position.clone().applyQuaternion(rotation)

    if (nextPosition.y < Math.max(0.2, this.gridSpan * 0.01)) {
      return
    }

    this.camera.position.copy(nextPosition)
    this.camera.quaternion.premultiply(rotation)
    this.camera.updateMatrixWorld()
    this.controls.target.set(0, 0, 0)
    this.renderFrame()
  }

  // --- keyboard movement (WASD / arrow keys) ---

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.visible || isTypingTarget(event.target)) {
      return
    }
    const move = toMoveKey(event.key)
    if (!move) {
      return
    }
    event.preventDefault()
    this.pressedMoveKeys.add(move)
    this.startMoveLoop()
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const move = toMoveKey(event.key)
    if (move) {
      this.pressedMoveKeys.delete(move)
    }
  }

  private readonly stopMoving = (): void => {
    this.pressedMoveKeys.clear()
    if (this.moveFrame) {
      cancelAnimationFrame(this.moveFrame)
      this.moveFrame = 0
    }
    this.lastMoveTimestamp = 0
  }

  private startMoveLoop(): void {
    if (this.moveFrame) {
      return
    }
    this.lastMoveTimestamp = 0
    this.moveFrame = requestAnimationFrame(this.moveLoop)
  }

  private readonly moveLoop = (timestamp: number): void => {
    this.moveFrame = 0
    if (!this.visible || this.pressedMoveKeys.size === 0) {
      this.lastMoveTimestamp = 0
      return
    }

    const deltaSeconds = this.lastMoveTimestamp === 0
      ? 0
      : Math.min((timestamp - this.lastMoveTimestamp) / 1000, 0.05)
    this.lastMoveTimestamp = timestamp

    if (deltaSeconds > 0) {
      this.applyMovement(deltaSeconds)
    }
    this.moveFrame = requestAnimationFrame(this.moveLoop)
  }

  private applyMovement(deltaSeconds: number): void {
    // Move along the camera's view direction projected onto the ground plane.
    const forward = new THREE.Vector3()
    this.camera.getWorldDirection(forward)
    forward.y = 0
    if (forward.lengthSq() < 1e-6) {
      forward.set(0, 0, -1)
    }
    forward.normalize()
    const right = new THREE.Vector3(forward.z, 0, -forward.x).negate()

    const step = new THREE.Vector3()
    if (this.pressedMoveKeys.has('forward'))
      step.add(forward)
    if (this.pressedMoveKeys.has('back'))
      step.sub(forward)
    if (this.pressedMoveKeys.has('right'))
      step.add(right)
    if (this.pressedMoveKeys.has('left'))
      step.sub(right)
    if (step.lengthSq() === 0) {
      return
    }

    const speed = Math.max(this.gridSpan * 0.6, 8)
    step.normalize().multiplyScalar(speed * deltaSeconds)
    this.camera.position.add(step)
    this.controls.target.set(0, 0, 0)
    this.renderFrame()
  }
}

type MoveKey = 'forward' | 'back' | 'left' | 'right'

function toMoveKey(key: string): MoveKey | null {
  switch (key.toLowerCase()) {
    case 'w':
    case 'arrowup':
      return 'forward'
    case 's':
    case 'arrowdown':
      return 'back'
    case 'a':
    case 'arrowleft':
      return 'left'
    case 'd':
    case 'arrowright':
      return 'right'
    default:
      return null
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
}
