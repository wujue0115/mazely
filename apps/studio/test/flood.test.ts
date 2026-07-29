import { describe, expect, it } from 'vitest'
import { getFloodDepthColor } from '../src/lib/flood'

describe('flood colors', () => {
  it('interpolates the reference PCCS palette by depth', () => {
    expect(getFloodDepthColor('pccs-bright', 0, 20, 20)).toBe('rgb(239,108,112)')
    expect(
      getFloodDepthColor('pccs-bright', 1, 20, 20),
    ).not.toBe(
      getFloodDepthColor('pccs-bright', 0, 20, 20),
    )
  })
})
