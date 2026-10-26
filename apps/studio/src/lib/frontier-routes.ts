import type { MazePoint } from './maze-types'
import { key, parsePointKey } from './point'

/** Visit shared ancestry once, like polygon overlays, instead of once per head. */
export function getFrontierRouteSegments(
  parentByKey: Record<string, string | null>,
  heads: MazePoint[],
  activeRoute: MazePoint[],
): MazePoint[][] {
  const edgeKey = (a: string, b: string) => a < b ? `${a}>${b}` : `${b}>${a}`
  const activeEdges = new Set<string>()
  for (let index = 1; index < activeRoute.length; index += 1) {
    activeEdges.add(edgeKey(key(activeRoute[index - 1].x, activeRoute[index - 1].y), key(activeRoute[index].x, activeRoute[index].y)))
  }
  const expanded = new Set<string>()
  const segments: MazePoint[][] = []
  for (const head of heads) {
    let current = key(head.x, head.y)
    let run: MazePoint[] = [head]
    while (!expanded.has(current)) {
      expanded.add(current)
      const parent = parentByKey[current]
      if (!parent)
        break
      const point = parsePointKey(parent)
      if (activeEdges.has(edgeKey(current, parent))) {
        if (run.length > 1)
          segments.push(run.reverse())
        run = [point]
      }
      else {
        run.push(point)
      }
      current = parent
    }
    if (run.length > 1)
      segments.push(run.reverse())
  }
  return segments
}

/** Normalize callers that still supply complete root-to-head routes. */
export function getUniqueRouteSegments(routes: MazePoint[][], activeRoute: MazePoint[]): MazePoint[][] {
  const parents: Record<string, string | null> = {}
  const heads: MazePoint[] = []
  for (const route of routes) {
    if (route.length < 2)
      continue
    parents[key(route[0].x, route[0].y)] ??= null
    for (let index = 1; index < route.length; index += 1) {
      parents[key(route[index].x, route[index].y)] = key(route[index - 1].x, route[index - 1].y)
    }
    heads.push(route.at(-1)!)
  }
  return getFrontierRouteSegments(parents, heads, activeRoute)
}
