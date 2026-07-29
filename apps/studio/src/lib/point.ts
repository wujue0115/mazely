import type { MazePoint } from './maze-types'

export function key(x: number, y: number): string {
  return `${x},${y}`
}

export function parsePointKey(pointKey: string): MazePoint {
  const [xString, yString] = pointKey.split(',')
  return {
    x: Number(xString),
    y: Number(yString),
  }
}

export function buildTrailKeysFromParentKey(
  parentByKey: Record<string, string | null>,
  headKey: string | null,
): Set<string> {
  const trail = new Set<string>()
  if (!headKey) {
    return trail
  }

  let currentKey: string | null = headKey
  while (currentKey != null) {
    if (trail.has(currentKey)) {
      break
    }

    trail.add(currentKey)
    currentKey = parentByKey[currentKey] ?? null
  }

  return trail
}

export function buildTrailPointsFromParentKey(
  parentByKey: Record<string, string | null>,
  headKey: string | null,
): MazePoint[] {
  const points: MazePoint[] = []
  if (!headKey) {
    return points
  }

  const visited = new Set<string>()
  let currentKey: string | null = headKey
  while (currentKey != null) {
    if (visited.has(currentKey)) {
      break
    }

    visited.add(currentKey)
    points.push(parsePointKey(currentKey))
    currentKey = parentByKey[currentKey] ?? null
  }

  points.reverse()
  return points
}

export function buildEdgeKeysFromPoints(points: MazePoint[]): Set<string> {
  const edges = new Set<string>()
  if (points.length < 2) {
    return edges
  }

  for (let index = 0; index < points.length - 1; index += 1) {
    edges.add(toEdgeKey(points[index], points[index + 1]))
  }

  return edges
}

export function toEdgeKey(a: MazePoint, b: MazePoint): string {
  return `${key(a.x, a.y)}>${key(b.x, b.y)}`
}
