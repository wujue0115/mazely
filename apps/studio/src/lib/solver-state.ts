import type { MazePoint, MazeSolvingAlgorithm } from './maze-types'

export interface SolveState {
  algorithm: MazeSolvingAlgorithm
  cameFrom: Record<string, MazePoint | null>
  end: MazePoint
  frontierSize: number
  path: MazePoint[]
  start: MazePoint
  status: 'running' | 'solved' | 'unsolved'
  visited: Record<string, true>
  visitedCount: number
}
