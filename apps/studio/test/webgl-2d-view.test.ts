import type { Webgl2dViewState } from '../src/lib/webgl-2d-view'
import { createMaze } from 'mazely'
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { Webgl2dMazeView } from '../src/lib/webgl-2d-view'

describe('webGL 2D wall rendering', () => {
  it('rebuilds walls when a same-sized maze runtime replaces the current one', () => {
    const openRuntime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })
    openRuntime.openAllEdges()
    const closedRuntime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })
    const view = Object.create(Webgl2dMazeView.prototype) as Webgl2dMazeView
    const wallMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial(),
      7,
    )

    Reflect.set(view, 'wallMesh', wallMesh)
    Reflect.set(view, 'wallMaterial', new THREE.MeshBasicMaterial())
    Reflect.set(view, 'wallRuntime', null)
    Reflect.set(view, 'lastWallKey', '')

    syncWalls(view, wallState(openRuntime))
    expect(wallMesh.count).toBe(6)

    syncWalls(view, wallState(closedRuntime))
    expect(wallMesh.count).toBe(7)
  })
})

function wallState(runtime: ReturnType<typeof createMaze>): Webgl2dViewState {
  return {
    runtime,
    wallColor: '#fff',
    wallRevision: 0,
    wallsVisible: true,
    wallThickness: 0.1,
  } as Webgl2dViewState
}

function syncWalls(view: Webgl2dMazeView, state: Webgl2dViewState): void {
  const syncWallsIfNeeded = Reflect.get(view, 'syncWallsIfNeeded') as (state: Webgl2dViewState) => void
  syncWallsIfNeeded.call(view, state)
}
