import { createMaze } from 'mazely'
import { describe, expect, it } from 'vitest'
import { getPointMarkerVisibility, shouldShowFloodVisualization } from '../src/lib/algorithms'
import { buildMazeSvg } from '../src/lib/export-svg'
import { DEFAULT_STYLE_THEME, DEFAULT_STYLE_VISIBILITY } from '../src/lib/types'

describe('buildMazeSvg', () => {
  it('keeps a completed flood visible on Generate until generation starts', () => {
    expect(shouldShowFloodVisualization({
      activeTab: 'generate',
      previewingGeneration: false,
      solvingAlgorithm: 'flood',
      solveStatus: 'solved',
    })).toBe(true)

    expect(shouldShowFloodVisualization({
      activeTab: 'generate',
      previewingGeneration: true,
      solvingAlgorithm: 'flood',
      solveStatus: 'solved',
    })).toBe(false)
  })

  it('matches the hidden point markers of a completed generation view', () => {
    expect(getPointMarkerVisibility({
      activeTab: 'generate',
      floodActive: false,
      floodStarted: false,
      generationAlgorithm: 'dfs',
      previewingGeneration: false,
      showingSolveResult: false,
      visibleEnd: true,
      visibleStart: true,
    })).toEqual({
      end: false,
      start: false,
    })
  })

  it('exports maze dimensions, cells, start and end points, and closed walls', () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })
    runtime.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, true)

    const svg = buildMazeSvg({
      maze: {
        algorithm: 'dfs',
        cols: 2,
        end: { x: 1, y: 0 },
        rows: 1,
        start: { x: 0, y: 0 },
      },
      runtime,
      theme: DEFAULT_STYLE_THEME,
      visibleElements: DEFAULT_STYLE_VISIBILITY,
    })

    expect(svg).toContain('width="40" height="20"')
    expect(svg).toContain('viewBox="0 0 40 20"')
    expect(svg.match(/<rect /g)).toHaveLength(2)
    expect(svg.match(/shape-rendering="crispEdges"/g)).toHaveLength(2)
    expect(svg).toContain('cx="10" cy="10"')
    expect(svg).toContain('cx="30" cy="10"')
    expect(svg).not.toContain('x1="20" y1="0" x2="20" y2="20"')
  })

  it('escapes theme colors used in SVG attributes', () => {
    const runtime = createMaze({ grid: { cols: 1, rows: 1, type: 'square' } })
    const svg = buildMazeSvg({
      maze: {
        algorithm: 'dfs',
        cols: 1,
        end: { x: 0, y: 0 },
        rows: 1,
        start: { x: 0, y: 0 },
      },
      runtime,
      theme: {
        ...DEFAULT_STYLE_THEME,
        unlinkedCell: '<cell&color>',
      },
      visibleElements: DEFAULT_STYLE_VISIBILITY,
    })

    expect(svg).toContain('fill="&lt;cell&amp;color&gt;"')
  })

  it('omits start and end points when the current view hides them', () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })
    runtime.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, true)

    const svg = buildMazeSvg({
      maze: {
        algorithm: 'dfs',
        cols: 2,
        end: { x: 1, y: 0 },
        rows: 1,
        start: { x: 0, y: 0 },
      },
      pointMarkers: {
        end: false,
        start: false,
      },
      runtime,
      theme: DEFAULT_STYLE_THEME,
      visibleElements: DEFAULT_STYLE_VISIBILITY,
    })

    expect(svg).not.toContain('<circle')
  })

  it('exports solve overlays when solve state is provided', () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })
    runtime.setEdgeOpenedBetween({ x: 0, y: 0 }, { x: 1, y: 0 }, true)

    const svg = buildMazeSvg({
      maze: {
        algorithm: 'dfs',
        cols: 2,
        end: { x: 1, y: 0 },
        rows: 1,
        start: { x: 0, y: 0 },
      },
      runtime,
      solve: {
        heads: [{ x: 1, y: 0 }],
        path: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        trails: [],
        visited: [{ x: 0, y: 0 }],
      },
      theme: DEFAULT_STYLE_THEME,
      visibleElements: DEFAULT_STYLE_VISIBILITY,
    })

    expect(svg).toContain(`fill="${DEFAULT_STYLE_THEME.visit}"`)
    expect(svg).toContain(`stroke="${DEFAULT_STYLE_THEME.path}" stroke-width="3.6"`)
    expect(svg).toContain(`fill="${DEFAULT_STYLE_THEME.head}"`)
  })

  it('exports flood depth colors without solve start and end points', () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })
    runtime.openAllEdges()
    const svg = buildMazeSvg({
      flood: {
        depthByKey: { '0,0': 0, '1,0': 1 },
        theme: 'pccs-bright',
      },
      maze: {
        algorithm: 'dfs',
        cols: 2,
        end: { x: 1, y: 0 },
        rows: 1,
        start: { x: 0, y: 0 },
      },
      runtime,
      theme: DEFAULT_STYLE_THEME,
      visibleElements: DEFAULT_STYLE_VISIBILITY,
    })

    expect(svg).toContain('fill="rgb(239,108,112)"')
    expect(svg).not.toContain('<circle')
  })
})
