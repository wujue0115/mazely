import { cellIdToPoint, createMaze } from 'mazely'
import { describe, expect, it } from 'vitest'
import { shouldShowGenerationTrail } from '../src/lib/algorithms'
import {
  advanceGenerationPreview,
  createGenerationPreview,
  getHuntScanSegment,
} from '../src/lib/controllers/generation'

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
