import type { MazePoint } from './maze-types'
import { getSolvingAlgorithm, isGenerationVisibleMultiHeadMode } from './algorithms'
import { app } from './app-state'
import { solvingSelect } from './dom'
import {
  buildEdgeKeysFromPoints,
  buildTrailKeysFromParentKey,
  buildTrailPointsFromParentKey,
  key,
  parsePointKey,
} from './point'
import { getAllNeighborPoints, getOpenNeighborPoints } from './runtime'

export function isSolvePriorityMode(): boolean {
  const algorithm = getSolvingAlgorithm(solvingSelect.value)
  return algorithm === 'a-star' || algorithm === 'best-first'
}

export function isGenerationPreviewVisible(): boolean {
  return app.activeTab === 'generate' && app.generationPreview !== null
}

/** Image color of a shape cell, or null without a shape / outside it. */
export function getShapeCellColor(x: number, y: number): string | null {
  if (!app.showShapeColors) {
    return null
  }
  return app.shape?.cellColors[y]?.[x] ?? null
}

export function isGenerationCellDiscoveredByMask(x: number, y: number): boolean {
  if (app.generationMaskCols === 0 || app.generationMaskRows === 0) {
    return app.generationPreview?.discoveredKeys.has(key(x, y)) ?? false
  }

  return app.generationDiscoveredMask[y * app.generationMaskCols + x] === 1
}

export function getGenerationTrailPoints(): MazePoint[] {
  if (!app.generationPreview?.currentHeadKey) {
    return []
  }

  return buildTrailPointsFromParentKey(app.generationPreview.parentByKey, app.generationPreview.currentHeadKey)
}

export function getGenerationActiveSegmentPoints(): MazePoint[] {
  return getGenerationTrailPoints()
}

export function getGenerationKruskalHeads(): MazePoint[] {
  return app.generationPreview ? app.generationPreview.lastCarveKeys.map(parsePointKey) : []
}

export function getGenerationFrontierHeads(): MazePoint[] {
  const preview = app.generationPreview
  if (!preview || !isGenerationVisibleMultiHeadMode(preview.algorithm)) {
    return []
  }

  if (app.cachedGenerationFrontierVersion === app.generationCacheVersion) {
    return app.cachedGenerationFrontierHeads
  }

  const frontier: MazePoint[] = []
  for (const pointKey of preview.discoveredKeys) {
    const point = parsePointKey(pointKey)
    const hasUndiscoveredNeighbor = getAllNeighborPoints(preview.runtime, point)
      .some(neighbor => !preview.discoveredKeys.has(key(neighbor.x, neighbor.y)))

    if (hasUndiscoveredNeighbor) {
      frontier.push(point)
    }
  }

  app.cachedGenerationFrontierHeads = frontier
  app.cachedGenerationFrontierVersion = app.generationCacheVersion
  return frontier
}

export function getGenerationFrontierTrailEdges(): Set<string> {
  const preview = app.generationPreview
  if (!preview || !isGenerationVisibleMultiHeadMode(preview.algorithm)) {
    return new Set<string>()
  }

  if (app.cachedGenerationFrontierTrailEdgesVersion === app.generationCacheVersion) {
    return app.cachedGenerationFrontierTrailEdges
  }

  const edgeKeys = new Set<string>()
  const frontierHeads = getGenerationFrontierHeads()
  for (const head of frontierHeads) {
    const trailPoints = buildTrailPointsFromParentKey(preview.parentByKey, key(head.x, head.y))
    const trailEdges = buildEdgeKeysFromPoints(trailPoints)
    for (const edgeKey of trailEdges) {
      edgeKeys.add(edgeKey)
    }
  }

  app.cachedGenerationFrontierTrailEdges = edgeKeys
  app.cachedGenerationFrontierTrailEdgesVersion = app.generationCacheVersion
  return edgeKeys
}

export function getGenerationTrailKeys(): Set<string> {
  if (!app.generationPreview) {
    return new Set<string>()
  }
  return buildTrailKeysFromParentKey(app.generationPreview.parentByKey, app.generationPreview.currentHeadKey)
}

export function bumpGenerationCacheVersion(): void {
  app.generationCacheVersion += 1
}

export function bumpSolveCacheVersion(): void {
  app.solveCacheVersion += 1
}

export function getSolveTrailPoints(): MazePoint[] {
  if (!app.solveCurrentHeadKey) {
    return []
  }

  const trailPoints = buildTrailPointsFromParentKey(getStepParentByKey(), app.solveCurrentHeadKey)

  return trailPoints
}

export function getSolvePriorityHeads(): MazePoint[] {
  if (!isSolvePriorityMode() || app.stepState.status !== 'running' || !app.solveRuntime) {
    return []
  }

  const heads: MazePoint[] = []
  const endKey = key(app.stepState.end.x, app.stepState.end.y)
  for (const pointKey of Object.keys(app.stepState.visited)) {
    if (pointKey === endKey) {
      continue
    }
    const point = parsePointKey(pointKey)
    const hasUnvisitedNeighbor = getOpenNeighborPoints(app.solveRuntime, point)
      .some(neighbor => !app.stepState.visited[key(neighbor.x, neighbor.y)])
    if (hasUnvisitedNeighbor) {
      heads.push(point)
    }
  }
  return heads
}

export function getSolvePriorityHeadTrails(heads: MazePoint[]): MazePoint[][] {
  if (!isSolvePriorityMode() || app.stepState.status !== 'running') {
    return []
  }

  const parentByKey = getStepParentByKey()

  return heads.map(head => buildTrailPointsFromParentKey(parentByKey, key(head.x, head.y)))
}

export function getPathSet(): Set<string> {
  if (app.cachedPathSource === app.stepState.path) {
    return app.cachedPathSet
  }

  app.cachedPathSource = app.stepState.path
  app.cachedPathSet = new Set(app.stepState.path.map(point => key(point.x, point.y)))
  return app.cachedPathSet
}

export function getStepParentByKey(): Record<string, string | null> {
  if (app.cachedParentByKeyVersion === app.solveCacheVersion) {
    return app.cachedParentByKey
  }

  app.cachedParentByKeyVersion = app.solveCacheVersion
  app.cachedParentByKey = Object.fromEntries(
    Object.entries(app.stepState.cameFrom).map(([pointKey, parent]) => [
      pointKey,
      parent ? key(parent.x, parent.y) : null,
    ]),
  )
  return app.cachedParentByKey
}
