// Generate deterministic animation data with the actual Mazely core.
// Usage: node --import tsx scripts/logo-animation.mjs > /tmp/mazely-logo.json
import process from 'node:process'
import { getCellBoundarySegments, getPointCenter } from '../apps/studio/src/lib/grid-geometry.ts'
// Use the same built core runtime as Studio for deterministic generation.
// eslint-disable-next-line antfu/no-import-dist
import { getLinkedNeighbors, Mazely } from '../packages/core/dist/index.mjs'

const unit = 4.8
const cols = 60
const rows = 59
// Rectilinear strokes of docs/public/logo.svg, sampled at cell centers.
const rectangles = [[0, 0, 43.2, 244.8], [81.6, 38.4, 288, 81.6], [244.8, 38.4, 288, 283.2], [81.6, 120, 124.8, 244.8], [163.2, 120, 206.4, 244.8], [81.6, 201.6, 206.4, 244.8]]
const included = new Set()
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    if (rectangles.some(([l, t, r, b]) => (x + 0.5) * unit >= l && (x + 0.5) * unit < r && (y + 0.5) * unit >= t && (y + 0.5) * unit < b))
      included.add(`${y}:${x}`)
  }
}
const components = []
while (included.size) {
  const queue = [included.values().next().value]
  included.delete(queue[0])
  for (let i = 0; i < queue.length; i++) {
    const [y, x] = queue[i].split(':').map(Number)
    for (const [ny, nx] of [[y - 1, x], [y + 1, x], [y, x - 1], [y, x + 1]]) {
      const id = `${ny}:${nx}`
      if (included.delete(id))
        queue.push(id)
    }
  }
  const ids = new Set(queue)
  const maze = new Mazely({ grid: { type: 'square', rows, cols, mask: Array.from({ length: rows }, (_, y) => Array.from({ length: cols }, (_, x) => ids.has(`${y}:${x}`))) }, seed: `mazely-logo-${components.length}` })
  const algorithm = ['dfs', 'traversal', 'kruskal'][components.length]
  const generation = maze.generate(algorithm)
  const initialClosed = new Map(maze.grid.edges.map(edge => [edge.id, !edge.opened]))
  generation.finish()
  const changes = new Map()
  const revealedAt = new Map()
  if (algorithm === 'recursive-division') {
    for (const cell of maze.grid.cells)
      revealedAt.set(cell.id, 0)
  }
  generation.steps.forEach((step, i) => {
    for (const patch of step.patches) {
      if (patch.type !== 'setEdgeOpened')
        continue
      const history = changes.get(patch.edgeId) ?? []
      history.push([i + 1, !patch.to])
      changes.set(patch.edgeId, history)
    }
    if (step.type === 'carve' || step.type === 'visit') {
      for (const id of [step.payload.from, step.payload.to]) {
        if (id && !revealedAt.has(id))
          revealedAt.set(id, i + 1)
      }
    }
  })
  const boundaries = new Map()
  for (const cell of maze.grid.cells) {
    for (const wall of getCellBoundarySegments(cell)) {
      const endpoints = [wall.from, wall.to].sort((a, b) => a.x - b.x || a.y - b.y)
      const boundaryKey = JSON.stringify(endpoints)
      const reveal = Math.min(boundaries.get(boundaryKey)?.revealedAt ?? Infinity, revealedAt.get(cell.id) ?? Infinity)
      boundaries.set(boundaryKey, { from: wall.from, to: wall.to, initialClosed: initialClosed.get(wall.edge?.id) ?? true, changes: changes.get(wall.edge?.id) ?? [], revealedAt: reveal })
    }
  }
  const centers = Object.fromEntries(maze.grid.cells.map(cell => [cell.id, getPointCenter(maze, { x: cell.col, y: cell.row })]))
  const generationHeads = generation.steps.map(s => s.type === 'carve' || s.type === 'visit' ? s.payload.to : null)
  function farthest(start) {
    const visited = new Set([start.id])
    const cells = [start]
    for (let i = 0; i < cells.length; i++) {
      for (const cell of getLinkedNeighbors(maze.grid, cells[i])) {
        if (!visited.has(cell.id)) {
          visited.add(cell.id)
          cells.push(cell)
        }
      }
    }
    return cells.at(-1)
  }
  const start = farthest(maze.grid.cells[0])
  const end = farthest(start)
  const solve = maze.solve('bfs', { start: { x: start.col, y: start.row }, end: { x: end.col, y: end.row } })
  solve.finish()
  const visits = solve.steps.flatMap(s => s.type === 'solve.process' ? [s.payload.current] : [])
  const result = maze.getSolveResult()
  if (!result?.solved || maze.grid.edges.filter(edge => edge.opened).length !== queue.length - 1)
    throw new Error('Invalid logo maze')
  components.push({ algorithm, revealedAt: Object.fromEntries(revealedAt), walls: [...boundaries.values()], centers, cells: queue, generationHeads, visits, path: result.path.map(p => `${p.y}:${p.x}`) })
}
process.stdout.write(JSON.stringify({ cols, rows, components }))
