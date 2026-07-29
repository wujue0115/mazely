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
  usesStart: boolean
}

export interface MazeSolvingAlgorithmCapabilities {
  requiresEnd: boolean
}

export const MAZE_GENERATION_CAPABILITIES = Object.freeze({
  'aldous-broder': { supportsMasks: true, usesStart: false },
  'binary-tree': { supportsMasks: true, usesStart: false },
  'dfs': { supportsMasks: true, usesStart: true },
  'eller': { supportsMasks: true, usesStart: false },
  'growing-tree': { supportsMasks: true, usesStart: true },
  'hunt-and-kill': { supportsMasks: true, usesStart: true },
  'kruskal': { supportsMasks: true, usesStart: false },
  'prim': { supportsMasks: true, usesStart: true },
  'recursive-division': { supportsMasks: true, usesStart: false },
  'sidewinder': { supportsMasks: true, usesStart: false },
  'traversal': { supportsMasks: true, usesStart: true },
  'wilson': { supportsMasks: true, usesStart: false },
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
