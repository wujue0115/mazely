/** Bound chord error to 0.04px at the default 20px cell scale. */
const MAX_CHORD_ERROR = 0.002

export function getPolarArcSegments(radius: number, angle: number): number {
  if (radius <= 0)
    return 1
  const maxAngle = 4 * Math.asin(Math.sqrt(Math.min(1, MAX_CHORD_ERROR / (2 * radius))))
  return Math.max(1, Math.ceil(Math.abs(angle) / maxAngle))
}

/** Shared angular lattice keeps split-ring fill boundaries identical. */
export function getPolarRingDivisions(radius: number, sectors: number): number {
  // At a shared radius, use the outer ring's sector count on both sides.
  // This is the same six-times-power-of-two layout used by the core grid.
  const ringSectors = radius === 1 ? 6 : 6 * 2 ** Math.ceil(Math.log2(Math.max(1, Math.PI * 2 * (radius + 0.5) / 9)))
  const minimum = Math.max(sectors, ringSectors, getPolarArcSegments(radius, Math.PI * 2))
  return 6 * 2 ** Math.ceil(Math.log2(Math.max(1, minimum / 6)))
}
