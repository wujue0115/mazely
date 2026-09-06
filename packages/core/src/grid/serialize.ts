import type { HexGridLayout, HexOrientation, MazeEdge, MazeGridType, TriangleGridLayout } from '../types'

export interface SerializedMaze {
  /** Missing only in serialized data produced before multi-topology support. */
  type?: MazeGridType
  triangleLayout?: TriangleGridLayout
  hexLayout?: HexGridLayout
  hexOrientation?: HexOrientation
  /** Side size for a triangular boundary; omitted for other boundaries. */
  size?: number
  rows: number
  cols: number
  openedEdgeIds: string[]
}

interface SerializableGrid {
  type?: MazeGridType
  layout?: TriangleGridLayout
  hexLayout?: HexGridLayout
  orientation?: HexOrientation
  size?: number
  rows: number
  cols: number
  edges: MazeEdge[]
}

export function serializeGrid(grid: SerializableGrid): SerializedMaze {
  return {
    cols: grid.cols,
    openedEdgeIds: grid.edges.filter(edge => edge.opened).map(edge => edge.id),
    rows: grid.rows,
    ...(grid.type === 'triangle'
      ? {
          ...(grid.size === undefined ? {} : { size: grid.size }),
          triangleLayout: grid.layout,
        }
      : {}),
    ...(grid.type === 'hexagon'
      ? {
          ...(grid.size === undefined ? {} : { size: grid.size }),
          hexLayout: grid.hexLayout,
          hexOrientation: grid.orientation,
        }
      : {}),
    type: grid.type,
  }
}

export function applySerializedGrid(grid: SerializableGrid, data: SerializedMaze): void {
  if (data.type && grid.type && grid.type !== data.type) {
    throw new TypeError(
      `Serialized maze uses a ${data.type} grid but the target grid is ${grid.type}.`,
    )
  }
  if (data.triangleLayout && grid.layout && grid.layout !== data.triangleLayout) {
    throw new TypeError(
      `Serialized triangle maze uses the ${data.triangleLayout} layout but the target grid uses the ${grid.layout} layout.`,
    )
  }
  if (data.hexLayout && grid.hexLayout && grid.hexLayout !== data.hexLayout) {
    throw new TypeError(
      `Serialized hex maze uses the ${data.hexLayout} layout but the target grid uses the ${grid.hexLayout} layout.`,
    )
  }
  if (data.hexOrientation && grid.orientation && grid.orientation !== data.hexOrientation) {
    throw new TypeError(
      `Serialized hex maze uses the ${data.hexOrientation} orientation but the target grid uses the ${grid.orientation} orientation.`,
    )
  }
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
