import type { AppState } from './app-state'

type MazeReplacementState = Pick<
  AppState,
  'generating' | 'generationPreview' | 'hasGeneratedMaze' | 'shape'
>

/** Whether replacing the grid would discard maze work that cannot be carried over. */
export function shouldConfirmMazeReplacement(state: MazeReplacementState): boolean {
  return state.hasGeneratedMaze
    || state.shape !== null
    || state.generating
    || (state.generationPreview?.player.index ?? 0) > 0
}
