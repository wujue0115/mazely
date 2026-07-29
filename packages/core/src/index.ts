export * from './algorithms'
export * from './engine'
export * from './generation'
export * from './graph'
export * from './grid'
export * from './main'
export * from './solving'
export * from './traversal'
export * from './types'
export * from './utils'

export const MAZELY_DEFAULTS = Object.freeze({
  generationAlgorithm: 'dfs',
  solvingAlgorithm: 'bfs',
} as const)
