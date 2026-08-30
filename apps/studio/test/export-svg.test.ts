import { createMaze } from 'mazely'
import { describe, expect, it } from 'vitest'
import { getPointMarkerVisibility, shouldShowFloodVisualization, shouldShowSolveProgress } from '../src/lib/algorithms'
import { buildMazeSvg } from '../src/lib/export-svg'
import { DEFAULT_STYLE_THEME, DEFAULT_STYLE_VISIBILITY } from '../src/lib/types'

describe('buildMazeSvg', () => {
  it('hides a completed flood outside the Solve panel', () => {
    expect(shouldShowFloodVisualization({
      activeTab: 'generate',
      previewingGeneration: false,
      solvingAlgorithm: 'flood',
      solveStarted: false,
      solveStatus: 'solved',
    })).toBe(false)

    expect(shouldShowFloodVisualization({
      activeTab: 'solve',
      previewingGeneration: false,
      solvingAlgorithm: 'flood',
      solveStarted: false,
      solveStatus: 'solved',
    })).toBe(true)

    expect(shouldShowFloodVisualization({
      activeTab: 'generate',
      previewingGeneration: true,
      solvingAlgorithm: 'flood',
      solveStarted: false,
      solveStatus: 'solved',
    })).toBe(false)
  })

  it('hides running solve visuals outside the Solve panel', () => {
    expect(shouldShowSolveProgress({
      activeTab: 'generate',
      previewingGeneration: false,
      solveStarted: true,
      solveStatus: 'running',
    })).toBe(false)

    expect(shouldShowSolveProgress({
      activeTab: 'generate',
      previewingGeneration: true,
      solveStarted: true,
      solveStatus: 'running',
    })).toBe(false)

    expect(shouldShowFloodVisualization({
      activeTab: 'generate',
      previewingGeneration: false,
      solvingAlgorithm: 'flood',
      solveStarted: true,
      solveStatus: 'running',
    })).toBe(false)

    expect(shouldShowSolveProgress({
      activeTab: 'solve',
      previewingGeneration: false,
      solveStarted: true,
      solveStatus: 'running',
    })).toBe(true)
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

    expect(svg).toContain('width="44" height="24"')
    expect(svg).toContain('viewBox="-2 -2 44 24"')
    expect(svg.match(/<rect /g)).toHaveLength(2)
    expect(svg.match(/shape-rendering="crispEdges"/g)).toHaveLength(2)
    expect(svg).toContain('cx="10" cy="10"')
    expect(svg).toContain('cx="30" cy="10"')
    expect(svg).not.toContain('x1="20" y1="0" x2="20" y2="20"')
  })

  it('exports triangular cells, bounds, walls, and centroid markers', () => {
    const runtime = createMaze({ grid: { layout: 'triangle', size: 2, type: 'triangle' } })
    runtime.openAllEdges()
    const svg = buildMazeSvg({
      maze: {
        algorithm: 'dfs',
        cols: 2,
        end: { x: 2, y: 1 },
        rows: 2,
        start: { x: 0, y: 0 },
      },
      runtime,
      theme: DEFAULT_STYLE_THEME,
      visibleElements: DEFAULT_STYLE_VISIBILITY,
    })

    expect(svg).toContain('width="44"')
    expect(svg).toContain('viewBox="-2 -2 44 38.641"')
    expect(svg.match(/<polygon /g)).toHaveLength(4)
    expect(svg).not.toContain('<rect ')
    expect(svg).toContain(`<path d="M `)
    expect(svg).toContain(`fill="${DEFAULT_STYLE_THEME.wall}"`)
    expect(svg).not.toContain(`stroke="${DEFAULT_STYLE_THEME.wall}"`)
    const wallPath = svg.match(new RegExp(`<path d="([^"]+)" fill="${DEFAULT_STYLE_THEME.wall}"`))?.[1] ?? ''
    const triangles = [...wallPath.matchAll(/M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+) Z/g)]
    expect(triangles.length).toBeGreaterThan(0)
    for (const triangle of triangles) {
      const [x1, y1, x2, y2, x3, y3] = triangle.slice(1).map(Number)
      expect((x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1)).toBeGreaterThanOrEqual(0)
    }
    expect(svg).toContain('cx="20"')
    expect(svg).toContain('cx="30"')
    expect(svg).toContain('r="3.29"')
  })

  it('exports the current wall thickness and grid appearance', () => {
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
      theme: DEFAULT_STYLE_THEME,
      visibleElements: {
        ...DEFAULT_STYLE_VISIBILITY,
        grid: true,
      },
      wallThickness: 6,
    })

    expect(svg).toContain('viewBox="-6 -6 32 32"')
    expect(svg).toContain(`stroke="${DEFAULT_STYLE_THEME.wall}" stroke-width="6"`)
    expect(svg).toContain(`stroke="${DEFAULT_STYLE_THEME.grid}" stroke-width="6"`)
  })

  it('uses current cell colors without repainting visited cells', () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })
    runtime.openAllEdges()
    const svg = buildMazeSvg({
      cellColor: x => x === 0 ? '#123456' : '#abcdef',
      maze: {
        algorithm: 'dfs',
        cols: 2,
        end: { x: 1, y: 0 },
        rows: 1,
        start: { x: 0, y: 0 },
      },
      runtime,
      solve: {
        heads: [],
        path: [],
        trails: [],
        visited: [{ x: 0, y: 0 }],
      },
      theme: DEFAULT_STYLE_THEME,
      visibleElements: DEFAULT_STYLE_VISIBILITY,
    })

    expect(svg.match(/fill="#123456"/g)).toHaveLength(1)
    expect(svg.match(/fill="#abcdef"/g)).toHaveLength(1)
    expect(svg).not.toContain(`fill="${DEFAULT_STYLE_THEME.visit}"`)
  })

  it('exports active 2D overlay colors, widths, and cap styles', () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })
    runtime.openAllEdges()
    const svg = buildMazeSvg({
      maze: {
        algorithm: 'dfs',
        cols: 2,
        end: { x: 1, y: 0 },
        rows: 1,
        start: { x: 0, y: 0 },
      },
      overlays: {
        dots: [{ color: '#fedcba', point: { x: 1, y: 0 }, radius: 0.2 }],
        segments: [{
          cap: 'butt',
          color: '#654321',
          from: { x: 0, y: 0 },
          to: { x: 1, y: 0 },
          width: 0.1,
        }],
      },
      runtime,
      theme: DEFAULT_STYLE_THEME,
      visibleElements: DEFAULT_STYLE_VISIBILITY,
    })

    expect(svg).toContain('stroke="#654321" stroke-width="2" stroke-linecap="butt"')
    expect(svg).toContain('r="4" fill="#fedcba"')
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
        frontierHeads: [{ x: 0, y: 0 }],
        frontierTrails: [[{ x: 0, y: 0 }, { x: 1, y: 0 }]],
        heads: [{ x: 1, y: 0 }],
        path: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
        trails: [],
        visited: [{ x: 0, y: 0 }],
      },
      theme: DEFAULT_STYLE_THEME,
      visibleElements: DEFAULT_STYLE_VISIBILITY,
    })

    expect(svg).toContain(`fill="${DEFAULT_STYLE_THEME.visit}"`)
    expect(svg).toContain(`stroke="${DEFAULT_STYLE_THEME.subPath}" stroke-width="2.8"`)
    expect(svg).toContain(`stroke="${DEFAULT_STYLE_THEME.path}" stroke-width="3.6"`)
    expect(svg).toContain(`fill="${DEFAULT_STYLE_THEME.frontier}"`)
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

  it('exports custom flood gradient colors', () => {
    const runtime = createMaze({ grid: { cols: 2, rows: 1, type: 'square' } })
    runtime.openAllEdges()
    const svg = buildMazeSvg({
      flood: {
        depthByKey: { '0,0': 0, '1,0': 1 },
        theme: {
          curve: { x1: 0, x2: 1, y1: 0, y2: 1 },
          endColor: '#ffffff',
          loop: false,
          startColor: '#000000',
          totalPoints: 2,
          type: 'custom',
        },
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

    expect(svg).toContain('fill="rgb(0,0,0)"')
    expect(svg).toContain('fill="rgb(255,255,255)"')
  })
})
