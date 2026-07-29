import type { RandomLike } from '../types'

export function createRandom(seed?: string | number): RandomLike {
  let state = normalizeSeed(seed)

  const next = () => {
    state += 0x6D2B79F5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int(min: number, max: number): number {
      if (max <= min) {
        return min
      }
      return Math.floor(next() * (max - min + 1)) + min
    },
    pick<Item>(items: Item[]): Item {
      if (items.length === 0) {
        throw new RangeError('Cannot pick from empty array.')
      }
      return items[this.int(0, items.length - 1)]
    },
    shuffle<Item>(items: Item[]): Item[] {
      const cloned = [...items]
      for (let i = cloned.length - 1; i > 0; i -= 1) {
        const j = this.int(0, i)
        const tmp = cloned[i]
        cloned[i] = cloned[j]
        cloned[j] = tmp
      }
      return cloned
    },
  }
}

function normalizeSeed(seed?: string | number): number {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return seed | 0
  }
  if (typeof seed === 'string') {
    let out = 0
    for (let i = 0; i < seed.length; i += 1) {
      out = Math.imul(31, out) + seed.charCodeAt(i) | 0
    }
    return out
  }
  return Math.floor(Math.random() * 0x100000000) | 0
}
