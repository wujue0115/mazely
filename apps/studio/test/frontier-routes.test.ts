import type { MazePoint } from '../src/lib/maze-types'
import { describe, expect, it } from 'vitest'
import { getFrontierRouteSegments, getUniqueRouteSegments } from '../src/lib/frontier-routes'

const point = (x: number, y = 0) => ({ x, y })
function edges(segments: MazePoint[][]) {
  return segments.flatMap(points => points.slice(1).map((to, index) => {
    const from = points[index]
    const a = `${from.x},${from.y}`
    const b = `${to.x},${to.y}`
    return a < b ? `${a}>${b}` : `${b}>${a}`
  }))
}

describe('frontier route rendering cost', () => {
  it('draws shared parent edges only once and omits active edges', () => {
    const parents = { '0,0': null, '1,0': '0,0', '2,0': '1,0', '3,0': '2,0', '2,1': '2,0', '4,0': '3,0' }
    const result = edges(getFrontierRouteSegments(parents, [point(3), point(2, 1), point(4)], [point(0), point(1)]))
    expect(result.sort()).toEqual(['1,0>2,0', '2,0>2,1', '2,0>3,0', '3,0>4,0'].sort())
    expect(new Set(result).size).toBe(result.length)
  })

  it('keeps output linear when many frontier heads share a long trunk', () => {
    let reads = 0
    const parents: Record<string, string | null> = { '0,0': null }
    for (let x = 1; x <= 1000; x += 1) parents[`${x},0`] = `${x - 1},0`
    const heads = Array.from({ length: 500 }, (_, index) => point(index, 1))
    for (const head of heads) parents[`${head.x},1`] = '1000,0'
    const proxy = new Proxy(parents, {
      get: (target, name: string) => {
        reads += 1
        return target[name]
      },
    })
    const result = edges(getFrontierRouteSegments(proxy, heads, []))
    expect(result).toHaveLength(1500)
    expect(new Set(result).size).toBe(1500)
    expect(reads).toBeLessThanOrEqual(1501)
  })

  it('normalizes complete SVG routes and excludes the active trunk', () => {
    const routes = [[point(0), point(1), point(2)], [point(0), point(1), point(3)]]
    const result = edges(getUniqueRouteSegments([...routes, ...routes], [point(0), point(1)]))
    expect(result.sort()).toEqual(['1,0>2,0', '1,0>3,0'])
  })

  it('handles cycles and disconnected preview trees without looping', () => {
    const parents = { '0,0': '1,0', '1,0': '0,0', '2,0': null, '3,0': '2,0' }
    const segments = getFrontierRouteSegments(parents, [point(0), point(3)], [])
    expect(segments.length).toBe(2)
    expect(segments.flat().length).toBeLessThanOrEqual(5)
  })
})
