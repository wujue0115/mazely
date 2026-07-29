import type { MazeEdge } from '../types'

export interface SerializedMaze {
  rows: number
  cols: number
  openedEdgeIds: string[]
}

interface SerializableGrid {
  rows: number
  cols: number
  edges: MazeEdge[]
}

export function serializeGrid(grid: SerializableGrid): SerializedMaze {
  return {
    rows: grid.rows,
    cols: grid.cols,
    openedEdgeIds: grid.edges.filter(edge => edge.opened).map(edge => edge.id),
  }
}

export function applySerializedGrid(grid: SerializableGrid, data: SerializedMaze): void {
  if (grid.rows !== data.rows || grid.cols !== data.cols) {
    throw new TypeError(
      `Serialized maze is ${data.rows}x${data.cols} but the grid is ${grid.rows}x${grid.cols}.`,
    )
  }

  const edgesById = new Map(grid.edges.map(edge => [edge.id, edge]))
  for (const edgeId of data.openedEdgeIds) {
    if (!edgesById.has(edgeId)) {
      throw new TypeError(`Serialized maze references unknown edge: ${edgeId}`)
    }
  }

  for (const edge of grid.edges) {
    edge.close()
  }
  for (const edgeId of data.openedEdgeIds) {
    edgesById.get(edgeId)!.open()
  }
}
