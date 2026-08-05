import { cellIdToPoint, createMaze } from 'mazely'
import { describe, expect, it } from 'vitest'
import { shouldShowGenerationTrail } from '../src/lib/algorithms'
import {
  advanceGenerationPreview,
  createGenerationPreview,
  getHuntScanSegment,
  rebuildGenerationPreview,
  shouldRenderGenerationPreview,
} from '../src/lib/controllers/generation'

describe('generation preview rewind', () => {
  it('restores visual and maze state after stepping backward', () => {
    const preview = createPreview('dfs', 'rewind-generation')
    for (let index = 0; index < 12; index += 1) {
      expect(advanceGenerationPreview(preview)).not.toBeNull()
    }
    const expectedVisual = snapshotPreview(preview)
    const expectedEdges = snapshotOpenedEdges(preview)

    expect(advanceGenerationPreview(preview)).not.toBeNull()
    expect(preview.player.prev()).toBe(true)
    rebuildGenerationPreview(preview)

    expect(snapshotPreview(preview)).toEqual(expectedVisual)
    expect(snapshotOpenedEdges(preview)).toEqual(expectedEdges)
  })

  it('can leave and re-enter the completed generation state', () => {
    const preview = createPreview('dfs', 'rewind-complete-generation')
    while (advanceGenerationPreview(preview) !== null) {
      // finish
    }
    const completedVisual = snapshotPreview(preview)
    const completedEdges = snapshotOpenedEdges(preview)
    preview.committed = true
    expect(shouldRenderGenerationPreview(preview)).toBe(false)

    expect(preview.player.prev()).toBe(true)
    rebuildGenerationPreview(preview)
    expect(preview.player.done).toBe(false)
    expect(shouldRenderGenerationPreview(preview)).toBe(true)

    expect(advanceGenerationPreview(preview)).not.toBeNull()
    expect(preview.player.done).toBe(true)
    expect(snapshotPreview(preview)).toEqual(completedVisual)
    expect(snapshotOpenedEdges(preview)).toEqual(completedEdges)
  })
})

describe('hunt-and-kill generation preview', () => {
  it('shows a full-width scan line, then returns to carving', () => {
    const runtime = createMaze({
      grid: { cols: 8, rows: 8, type: 'square' },
      seed: 'hunt-scan',
    })
    const preview = createGenerationPreview({
      algorithm: 'hunt-and-kill',
      player: runtime.generate('hunt-and-kill'),
      runtime,
      view: {
        algorithm: 'hunt-and-kill',
        cols: 8,
        end: { x: 7, y: 7 },
        rows: 8,
        start: { x: 0, y: 0 },
      },
    })

    advanceUntil(() => preview.huntScanRow !== null, preview)

    expect(preview.currentHeadKey).toBeNull()
    expect(getHuntScanSegment(preview)).toEqual({
      from: { x: -0.5, y: preview.huntScanRow },
      to: { x: 7.5, y: preview.huntScanRow },
    })

    advanceUntil(() => preview.huntScanRow === null && preview.currentHeadKey !== null, preview)

    expect(getHuntScanSegment(preview)).toBeNull()
  })
})

describe('aldous-broder generation preview', () => {
  it('moves the head on revisits without showing a trail', () => {
    const runtime = createMaze({
      grid: { cols: 4, rows: 4, type: 'square' },
      seed: 'aldous-walk',
    })
    const preview = createGenerationPreview({
      algorithm: 'aldous-broder',
      player: runtime.generate('aldous-broder'),
      runtime,
      view: {
        algorithm: 'aldous-broder',
        cols: 4,
        end: { x: 3, y: 3 },
        rows: 4,
        start: { x: 0, y: 0 },
      },
    })

    advanceUntil(
      () => preview.player.lastStep?.type === 'visit' && Boolean(preview.player.lastStep.payload.from),
      preview,
    )

    const head = cellIdToPoint(String(preview.player.lastStep?.payload.to))
    expect(preview.currentHeadKey).toBe(`${head.x},${head.y}`)
    expect(shouldShowGenerationTrail('aldous-broder')).toBe(false)
    expect(shouldShowGenerationTrail('dfs')).toBe(true)
  })
})

describe('binary-tree generation preview', () => {
  it('keeps masked-maze heads moving toward the current cell', () => {
    const T = true
    const F = false
    const mask = [
      [F, F, T, F, F],
      [F, F, T, F, F],
      [T, T, T, T, T],
      [F, F, T, F, F],
      [F, F, T, F, F],
    ]
    const runtime = createMaze({
      grid: { cols: 5, mask, rows: 5, type: 'square' },
      seed: 'masked-binary-tree-direction',
    })
    const preview = createGenerationPreview({
      algorithm: 'binary-tree',
      player: runtime.generate('binary-tree'),
      runtime,
      view: {
        algorithm: 'binary-tree',
        cols: 5,
        end: { x: 4, y: 2 },
        rows: 5,
        start: { x: 0, y: 2 },
      },
    })

    while (advanceGenerationPreview(preview) !== null) {
      const step = preview.player.lastStep
      if (step?.type !== 'carve') {
        continue
      }
      const from = cellIdToPoint(step.payload.from!)
      const to = cellIdToPoint(step.payload.to)
      expect(to.y > from.y || (to.y === from.y && to.x > from.x)).toBe(true)
      expect(preview.currentHeadKey).toBe(`${to.x},${to.y}`)
      expect(preview.parentByKey[`${to.x},${to.y}`]).toBe(`${from.x},${from.y}`)
    }
  })
})

function advanceUntil(
  condition: () => boolean,
  preview: Parameters<typeof advanceGenerationPreview>[0],
): void {
  for (let step = 0; step < 1000 && !condition(); step += 1) {
    if (advanceGenerationPreview(preview) === null) {
      break
    }
  }
  expect(condition()).toBe(true)
}

function createPreview(algorithm: 'dfs', seed: string) {
  const runtime = createMaze({
    grid: { cols: 5, rows: 5, type: 'square' },
    seed,
  })
  return createGenerationPreview({
    algorithm,
    player: runtime.generate(algorithm),
    runtime,
    view: {
      algorithm,
      cols: 5,
      end: { x: 4, y: 4 },
      rows: 5,
      start: { x: 0, y: 0 },
    },
  })
}

function snapshotPreview(preview: ReturnType<typeof createPreview>) {
  return {
    currentHeadKey: preview.currentHeadKey,
    discoveredCount: preview.discoveredCount,
    discoveredKeys: [...preview.discoveredKeys].sort(),
    huntScanRow: preview.huntScanRow,
    lastCarveKeys: [...preview.lastCarveKeys],
    parentByKey: { ...preview.parentByKey },
  }
}

function snapshotOpenedEdges(preview: ReturnType<typeof createPreview>): string[] {
  return preview.runtime.grid.edges
    .filter(edge => edge.opened)
    .map(edge => edge.id)
    .sort()
}
