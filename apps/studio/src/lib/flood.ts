type Rgb = readonly [number, number, number]

export interface FloodCurve {
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface CustomFloodTheme {
  curve: FloodCurve
  endColor: string
  loop: boolean
  startColor: string
  totalPoints: number
  type: 'custom'
}

const FLOOD_PALETTES = {
  'pccs-pale': [[231, 213, 212], [233, 213, 207], [246, 227, 206], [239, 230, 198], [230, 233, 198], [196, 224, 203], [191, 224, 217], [198, 221, 226], [194, 204, 213], [201, 202, 213], [208, 200, 209], [228, 213, 217]],
  'pccs-pale+': [[232, 194, 191], [235, 194, 181], [244, 212, 176], [242, 230, 184], [216, 221, 173], [174, 212, 185], [166, 212, 204], [173, 209, 218], [175, 192, 209], [187, 189, 208], [200, 185, 201], [222, 196, 202]],
  'pccs-light': [[246, 171, 165], [255, 185, 158], [255, 206, 144], [251, 230, 143], [216, 223, 146], [156, 217, 172], [126, 204, 193], [121, 186, 202], [131, 167, 200], [162, 159, 199], [184, 154, 184], [218, 160, 179]],
  'pccs-light+': [[241, 152, 150], [255, 167, 135], [255, 190, 113], [242, 217, 110], [199, 211, 109], [133, 206, 158], [98, 192, 181], [91, 175, 196], [108, 154, 197], [144, 145, 195], [176, 136, 181], [217, 142, 165]],
  'pccs-bright': [[239, 108, 112], [250, 129, 85], [255, 173, 54], [250, 216, 49], [183, 200, 43], [65, 184, 121], [0, 170, 159], [0, 152, 185], [41, 129, 192], [117, 116, 188], [161, 101, 168], [208, 103, 142]],
  'pccs-light-grayish': [[192, 171, 170], [193, 171, 165], [206, 187, 168], [198, 190, 161], [189, 193, 162], [157, 182, 165], [152, 182, 177], [158, 180, 185], [155, 165, 175], [162, 162, 175], [171, 160, 171], [189, 172, 176]],
  'pccs-soft': [[202, 130, 129], [218, 146, 122], [219, 166, 107], [211, 189, 108], [173, 182, 107], [118, 177, 138], [84, 163, 155], [81, 146, 164], [93, 126, 160], [120, 120, 160], [144, 113, 148], [180, 120, 139]],
  'pccs-strong': [[197, 63, 77], [204, 87, 46], [225, 146, 21], [222, 188, 3], [156, 173, 0], [0, 143, 86], [0, 130, 124], [0, 111, 146], [0, 91, 155], [83, 76, 152], [124, 61, 132], [163, 60, 106]],
  'pccs-vivid': [[208, 47, 72], [233, 91, 35], [244, 157, 0], [238, 201, 0], [168, 187, 0], [0, 161, 90], [0, 133, 127], [0, 112, 155], [0, 91, 165], [83, 74, 160], [129, 55, 138], [173, 46, 108]],
  'pccs-grayish': [[116, 92, 92], [117, 92, 87], [128, 108, 92], [120, 111, 87], [110, 114, 90], [83, 102, 90], [78, 103, 100], [79, 101, 108], [76, 87, 101], [86, 85, 102], [96, 82, 98], [114, 92, 99]],
  'pccs-dull': [[163, 90, 92], [175, 105, 84], [179, 127, 70], [171, 148, 70], [133, 143, 70], [79, 135, 102], [42, 123, 118], [36, 106, 125], [52, 89, 125], [84, 82, 124], [108, 74, 113], [139, 79, 101]],
  'pccs-deep': [[166, 29, 57], [171, 61, 29], [177, 108, 0], [179, 147, 0], [116, 132, 0], [0, 114, 67], [0, 102, 100], [0, 84, 118], [0, 66, 128], [62, 51, 123], [97, 36, 105], [134, 29, 85]],
  'pccs-dark': [[105, 41, 52], [117, 54, 42], [121, 77, 28], [116, 96, 31], [82, 91, 32], [35, 82, 58], [0, 71, 70], [0, 69, 88], [18, 52, 82], [50, 45, 81], [67, 40, 72], [97, 45, 70]],
  'pccs-dark-grayish': [[62, 45, 48], [63, 46, 44], [74, 60, 50], [68, 62, 48], [61, 64, 51], [42, 52, 46], [39, 52, 52], [39, 52, 57], [34, 41, 51], [41, 39, 52], [48, 37, 49], [61, 46, 52]],
  'gray': [[255, 255, 255], [0, 0, 0]],
} as const satisfies Record<string, readonly Rgb[]>

export type FloodTheme = keyof typeof FLOOD_PALETTES
export type FloodThemeSelection = FloodTheme | 'custom'
export type FloodColorSource = FloodTheme | CustomFloodTheme

export const DEFAULT_FLOOD_THEME: FloodTheme = 'pccs-bright'
export const MIN_CUSTOM_FLOOD_POINTS = 2
export const MAX_CUSTOM_FLOOD_POINTS = 10_000
export const LINEAR_FLOOD_CURVE: FloodCurve = { x1: 0, x2: 1, y1: 0, y2: 1 }
export const DEFAULT_CUSTOM_FLOOD_THEME: CustomFloodTheme = {
  curve: { ...LINEAR_FLOOD_CURVE },
  endColor: '#264054',
  loop: false,
  startColor: '#91f7ff',
  totalPoints: 20,
  type: 'custom',
}

export function isFloodTheme(value: string): value is FloodTheme {
  return Object.hasOwn(FLOOD_PALETTES, value)
}

export function isCustomFloodTheme(value: unknown): value is CustomFloodTheme {
  if (!value || typeof value !== 'object') {
    return false
  }
  const theme = value as Partial<CustomFloodTheme>
  return theme.type === 'custom'
    && isHexColor(theme.startColor)
    && isHexColor(theme.endColor)
    && typeof theme.loop === 'boolean'
    && Number.isInteger(theme.totalPoints)
    && theme.totalPoints! >= MIN_CUSTOM_FLOOD_POINTS
    && theme.totalPoints! <= MAX_CUSTOM_FLOOD_POINTS
    && isFloodCurve(theme.curve)
}

export function getFloodDepthColor(source: FloodColorSource, depth: number, rows: number, cols: number): string {
  if (typeof source !== 'string') {
    return getCustomFloodDepthColor(source, depth)
  }

  const theme = source
  const palette = FLOOD_PALETTES[theme]
  const cycleLength = Math.max(palette.length, rows + cols - 5)
  const position = (Math.max(0, depth) * palette.length) / cycleLength
  const index = Math.floor(position) % palette.length
  const nextIndex = (index + 1) % palette.length
  const ratio = position - Math.floor(position)
  const from = palette[index]
  const to = palette[nextIndex]
  const channel = (offset: number): number => Math.floor(from[offset] + (to[offset] - from[offset]) * ratio)
  return `rgb(${channel(0)},${channel(1)},${channel(2)})`
}

export function generateCustomFloodColors(theme: CustomFloodTheme): string[] {
  return Array.from({ length: theme.totalPoints }, (_, index) =>
    getCustomFloodDepthColor(theme, index))
}

/** One-way preview samples. Loop playback must never add A back at the end. */
export function generateCustomFloodPreviewColors(theme: CustomFloodTheme, maxSamples = 128): string[] {
  const totalPoints = Math.min(theme.totalPoints, Math.max(MIN_CUSTOM_FLOOD_POINTS, maxSamples))
  const previewTheme: CustomFloodTheme = { ...theme, loop: false, totalPoints }
  const colors = generateCustomFloodColors(previewTheme)
  colors[0] = theme.startColor.toLowerCase()
  colors[colors.length - 1] = theme.endColor.toLowerCase()
  return colors
}

export function evaluateFloodCurve(curve: FloodCurve, progress: number): number {
  const targetX = clamp(progress, 0, 1)
  if (targetX === 0 || targetX === 1) {
    return targetX
  }
  let lower = 0
  let upper = 1
  let parameter = targetX

  // Invert the Bezier x component so the draggable curve behaves like a
  // conventional easing graph: x is depth progress and y is color progress.
  for (let iteration = 0; iteration < 24; iteration += 1) {
    parameter = (lower + upper) / 2
    const x = cubicBezier(parameter, curve.x1, curve.x2)
    if (x < targetX) {
      lower = parameter
    }
    else {
      upper = parameter
    }
  }

  return clamp(cubicBezier(parameter, curve.y1, curve.y2), 0, 1)
}

function getCustomFloodDepthColor(theme: CustomFloodTheme, depth: number): string {
  const normalizedDepth = Math.max(0, Math.floor(depth))
  const span = theme.totalPoints - 1
  const cycleLength = span * 2
  const cyclePosition = normalizedDepth % cycleLength
  const pointIndex = theme.loop
    ? (cyclePosition <= span ? cyclePosition : cycleLength - cyclePosition)
    : Math.min(normalizedDepth, span)
  const progress = pointIndex / (theme.totalPoints - 1)
  const ratio = evaluateFloodCurve(theme.curve, progress)
  const from = hexToRgb(theme.startColor)
  const to = hexToRgb(theme.endColor)
  const channel = (offset: number): number => Math.floor(from[offset] + (to[offset] - from[offset]) * ratio)
  return `rgb(${channel(0)},${channel(1)},${channel(2)})`
}

function cubicBezier(parameter: number, firstControl: number, secondControl: number): number {
  const inverse = 1 - parameter
  return 3 * inverse * inverse * parameter * firstControl
    + 3 * inverse * parameter * parameter * secondControl
    + parameter * parameter * parameter
}

function isFloodCurve(value: unknown): value is FloodCurve {
  if (!value || typeof value !== 'object') {
    return false
  }
  const curve = value as Partial<FloodCurve>
  return [curve.x1, curve.y1, curve.x2, curve.y2].every(coordinate =>
    typeof coordinate === 'number' && Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1)
}

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

function hexToRgb(value: string): Rgb {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
