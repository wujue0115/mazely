import type { MazeGenerationAlgorithm, MazePoint } from 'mazely'

export type {
  MazeGenerationAlgorithm,
  MazePoint,
  MazeSolvingAlgorithm,
} from 'mazely'

export interface MazeViewState {
  algorithm: MazeGenerationAlgorithm
  cols: number
  end: MazePoint
  rows: number
  start: MazePoint
}
