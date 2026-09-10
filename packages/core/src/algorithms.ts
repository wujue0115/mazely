export const MAZE_GENERATION_ALGORITHMS = [
  'aldous-broder',
  'binary-tree',
  'dfs',
  'eller',
  'growing-tree',
  'hunt-and-kill',
  'kruskal',
  'prim',
  'recursive-division',
  'sidewinder',
  'traversal',
  'wilson',
] as const

export const MAZE_SOLVING_ALGORITHMS = [
  'a-star',
  'best-first',
  'bfs',
  'dfs',
  'flood',
] as const

export type MazeGenerationAlgorithm = typeof MAZE_GENERATION_ALGORITHMS[number]
export type MazeSolvingAlgorithm = typeof MAZE_SOLVING_ALGORITHMS[number]

export interface MazeGenerationAlgorithmCapabilities {
  supportsMasks: true
  supportedGridTypes: readonly ('square' | 'triangle' | 'hexagon')[]
  usesStart: boolean
}

export interface MazeSolvingAlgorithmCapabilities {
  requiresEnd: boolean
}

export const MAZE_GENERATION_CAPABILITIES = Object.freeze({
  'aldous-broder': { supportedGridTypes: ['square', 'triangle', 'hexagon'], supportsMasks: true, usesStart: false },
  'binary-tree': { supportedGridTypes: ['square', 'triangle', 'hexagon'], supportsMasks: true, usesStart: false },
  'dfs': { supportedGridTypes: ['square', 'triangle', 'hexagon'], supportsMasks: true, usesStart: true },
  'eller': { supportedGridTypes: ['square', 'triangle', 'hexagon'], supportsMasks: true, usesStart: false },
  'growing-tree': { supportedGridTypes: ['square', 'triangle', 'hexagon'], supportsMasks: true, usesStart: true },
  'hunt-and-kill': { supportedGridTypes: ['square', 'triangle', 'hexagon'], supportsMasks: true, usesStart: true },
  'kruskal': { supportedGridTypes: ['square', 'triangle', 'hexagon'], supportsMasks: true, usesStart: false },
  'prim': { supportedGridTypes: ['square', 'triangle', 'hexagon'], supportsMasks: true, usesStart: true },
  'recursive-division': { supportedGridTypes: ['square', 'triangle', 'hexagon'], supportsMasks: true, usesStart: false },
  'sidewinder': { supportedGridTypes: ['square', 'triangle', 'hexagon'], supportsMasks: true, usesStart: false },
  'traversal': { supportedGridTypes: ['square', 'triangle', 'hexagon'], supportsMasks: true, usesStart: true },
  'wilson': { supportedGridTypes: ['square', 'triangle', 'hexagon'], supportsMasks: true, usesStart: false },
} satisfies Record<MazeGenerationAlgorithm, MazeGenerationAlgorithmCapabilities>)

export const MAZE_SOLVING_CAPABILITIES = Object.freeze({
  'a-star': { requiresEnd: true },
  'best-first': { requiresEnd: true },
  'bfs': { requiresEnd: true },
  'dfs': { requiresEnd: true },
  'flood': { requiresEnd: false },
} satisfies Record<MazeSolvingAlgorithm, MazeSolvingAlgorithmCapabilities>)

export function isMazeGenerationAlgorithm(value: unknown): value is MazeGenerationAlgorithm {
  return typeof value === 'string'
    && (MAZE_GENERATION_ALGORITHMS as readonly string[]).includes(value)
}

export function isMazeSolvingAlgorithm(value: unknown): value is MazeSolvingAlgorithm {
  return typeof value === 'string'
    && (MAZE_SOLVING_ALGORITHMS as readonly string[]).includes(value)
}
