export type Direction = 'north' | 'east' | 'south' | 'west'
export type PanelTab = 'generate' | 'solve' | 'edit'
export type MazeEditTool = 'edge' | 'start' | 'end' | 'pan'
export type MazeEditTarget
  = | {
    type: 'cell'
    x: number
    y: number
  }
  | {
    type: 'edge'
    from: { x: number, y: number }
    to: { x: number, y: number }
  }

export interface StyleTheme {
  cell: string
  frontier: string
  grid: string
  end: string
  head: string
  path: string
  start: string
  subPath: string
  unlinkedCell: string
  visit: string
  wall: string
}

export type StyleKey = keyof StyleTheme
export type StyleVisibility = Record<StyleKey, boolean>

export const FIXED_CELL_SIZE = 20
export const ZOOM_MIN = 0.2
export const ZOOM_MAX = 8

export const DEFAULT_STYLE_THEME: StyleTheme = {
  cell: '#0e0e0e',
  frontier: '#6798a2',
  grid: '#b8c2c7',
  end: '#ffa1d4',
  head: '#00deec',
  path: '#8ff5ff',
  start: '#5df0c0',
  subPath: '#181818',
  unlinkedCell: '#767575',
  visit: '#264054',
  wall: '#767575',
}

export const DEFAULT_STYLE_VISIBILITY: StyleVisibility = {
  cell: true,
  frontier: true,
  grid: false,
  end: true,
  head: true,
  path: true,
  start: true,
  subPath: true,
  unlinkedCell: true,
  visit: true,
  wall: true,
}
