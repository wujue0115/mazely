import { describe, expect, it } from 'vitest'
import {
  evaluateFloodCurve,
  generateCustomFloodColors,
  generateCustomFloodPreviewColors,
  getFloodDepthColor,
  isCustomFloodTheme,
} from '../src/lib/flood'

describe('flood colors', () => {
  it('interpolates the reference PCCS palette by depth', () => {
    expect(getFloodDepthColor('pccs-bright', 0, 20, 20)).toBe('rgb(239,108,112)')
    expect(
      getFloodDepthColor('pccs-bright', 1, 20, 20),
    ).not.toBe(
      getFloodDepthColor('pccs-bright', 0, 20, 20),
    )
  })

  it('generates a fixed number of custom colors including both endpoints', () => {
    const theme = {
      curve: { x1: 0, x2: 1, y1: 0, y2: 1 },
      endColor: '#ffffff',
      loop: false,
      startColor: '#000000',
      totalPoints: 5,
      type: 'custom',
    } as const

    expect(generateCustomFloodColors(theme)).toEqual([
      'rgb(0,0,0)',
      'rgb(63,63,63)',
      'rgb(127,127,127)',
      'rgb(191,191,191)',
      'rgb(255,255,255)',
    ])
    expect(getFloodDepthColor(theme, 99, 20, 20)).toBe('rgb(255,255,255)')
  })

  it('uses the editable curve to change intermediate color progress', () => {
    const easeIn = { x1: 0.42, x2: 1, y1: 0, y2: 1 }
    expect(evaluateFloodCurve(easeIn, 0.5)).toBeLessThan(0.5)
    expect(evaluateFloodCurve(easeIn, 0)).toBe(0)
    expect(evaluateFloodCurve(easeIn, 1)).toBe(1)
  })

  it('validates persisted custom flood themes', () => {
    expect(isCustomFloodTheme({
      curve: { x1: 0, x2: 1, y1: 0, y2: 1 },
      endColor: '#ffffff',
      loop: false,
      startColor: '#000000',
      totalPoints: 2,
      type: 'custom',
    })).toBe(true)
    expect(isCustomFloodTheme({
      curve: { x1: -1, x2: 1, y1: 0, y2: 1 },
      endColor: '#ffffff',
      loop: false,
      startColor: '#000000',
      totalPoints: 1,
      type: 'custom',
    })).toBe(false)
  })

  it('loops custom colors from A to B and back without jumping', () => {
    const theme = {
      curve: { x1: 0, x2: 1, y1: 0, y2: 1 },
      endColor: '#ffffff',
      loop: true,
      startColor: '#000000',
      totalPoints: 3,
      type: 'custom',
    } as const

    expect(Array.from({ length: 9 }, (_, depth) =>
      getFloodDepthColor(theme, depth, 1, 1))).toEqual([
      'rgb(0,0,0)',
      'rgb(127,127,127)',
      'rgb(255,255,255)',
      'rgb(127,127,127)',
      'rgb(0,0,0)',
      'rgb(127,127,127)',
      'rgb(255,255,255)',
      'rgb(127,127,127)',
      'rgb(0,0,0)',
    ])
  })

  it('keeps the loop start color out of the preview endpoint', () => {
    const colors = generateCustomFloodPreviewColors({
      curve: { x1: 0.25, x2: 0.75, y1: 0.1, y2: 0.9 },
      endColor: '#abcdef',
      loop: true,
      startColor: '#123456',
      totalPoints: 20,
      type: 'custom',
    })

    expect(colors[0]).toBe('#123456')
    expect(colors.at(-1)).toBe('#abcdef')
  })
})
