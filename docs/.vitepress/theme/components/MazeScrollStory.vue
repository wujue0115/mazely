<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

interface Point {
  x: number
  y: number
}

interface DfsCarve {
  from: Point
  to: Point
  wall: string
}

const COLS = 40
const ROWS = 24
const END_HOLD_VIEWPORT_RATIO = 0.4
const GENERATION_END = 0.56
const START_MARKER_START = 0.58
const START_MARKER_END = 0.64
const END_MARKER_START = 0.64
const END_MARKER_END = 0.70
const SOLUTION_START = 0.74

const scrollSection = ref<HTMLElement | null>(null)
const stickyFrame = ref<HTMLElement | null>(null)
const mazeCanvas = ref<HTMLElement | null>(null)
const storyProgress = ref(0)
const mazeSize = ref({ height: 0, width: 0 })
const mazeRotated = ref(false)
let animationFrame = 0
let reducedMotionQuery: MediaQueryList | null = null
let mazeResizeObserver: ResizeObserver | null = null

const finalWallPath = ref('')
const dfsCarves = shallowRef<DfsCarve[]>([])
const dfsParentByKey = shallowRef(new Map<string, Point>())
const solutionPoints = shallowRef<Point[]>([])
const solutionPath = computed(() =>
  solutionPoints.value
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x + 0.5} ${point.y + 0.5}`)
    .join(' '),
)
const solutionSteps = computed(() =>
  Math.max(0, solutionPoints.value.length - 1),
)

const generationProgress = computed(() =>
  normalizeProgress(storyProgress.value, 0, GENERATION_END),
)

const carvedPassages = computed(() =>
  Math.min(
    dfsCarves.value.length,
    Math.floor(generationProgress.value * dfsCarves.value.length),
  ),
)

const generationWallPath = computed(() => {
  if (generationProgress.value >= 1) {
    return finalWallPath.value
  }
  if (carvedPassages.value === 0) {
    return ''
  }

  const visibleCarves = dfsCarves.value.slice(0, carvedPassages.value)
  const discoveredCells = [
    visibleCarves[0].from,
    ...visibleCarves.map(carve => carve.to),
  ]
  const openedWalls = new Set(visibleCarves.map(carve => carve.wall))
  const visibleWalls = new Set<string>()

  for (const cell of discoveredCells) {
    for (const wall of getCellWalls(cell)) {
      if (!openedWalls.has(wall)) {
        visibleWalls.add(wall)
      }
    }
  }

  return [...visibleWalls].join('')
})

const activeGenerationCarve = computed<DfsCarve | undefined>(() =>
  carvedPassages.value > 0 && generationProgress.value < 1
    ? dfsCarves.value[carvedPassages.value - 1]
    : undefined,
)

const generationTrailPath = computed(() => {
  const activeCarve = activeGenerationCarve.value
  if (!activeCarve) {
    return ''
  }

  return buildGenerationTrail(activeCarve.to)
    .map((point, index) =>
      `${index === 0 ? 'M' : 'L'}${point.x + 0.5} ${point.y + 0.5}`,
    )
    .join(' ')
})

const startMarkerProgress = computed(() =>
  normalizeProgress(
    storyProgress.value,
    START_MARKER_START,
    START_MARKER_END,
  ),
)

const endMarkerProgress = computed(() =>
  normalizeProgress(
    storyProgress.value,
    END_MARKER_START,
    END_MARKER_END,
  ),
)

const solutionProgress = computed(() =>
  normalizeProgress(storyProgress.value, SOLUTION_START, 1),
)

const visibleStep = computed(() =>
  Math.min(
    solutionSteps.value,
    Math.floor(solutionProgress.value * solutionSteps.value),
  ),
)

const currentPoint = computed<Point>(() => {
  if (solutionPoints.value.length === 0) {
    return { x: 0, y: 0 }
  }

  const exactStep = solutionProgress.value * solutionSteps.value
  const index = Math.min(
    Math.floor(exactStep),
    solutionPoints.value.length - 1,
  )
  const current = solutionPoints.value[index]
  const next = solutionPoints.value[
    Math.min(index + 1, solutionPoints.value.length - 1)
  ]
  const segmentProgress = exactStep - Math.floor(exactStep)

  return {
    x: current.x + (next.x - current.x) * segmentProgress,
    y: current.y + (next.y - current.y) * segmentProgress,
  }
})

const pathStyle = computed(() => ({
  strokeDashoffset: String(100 - solutionProgress.value * 100),
}))

const startMarkerPoint = computed(() =>
  getDisplayPoint({ x: 0.5, y: 0.5 }),
)

const endMarkerPoint = computed(() =>
  getDisplayPoint({ x: COLS - 0.5, y: ROWS - 0.5 }),
)

const startMarkerStyle = computed(() =>
  getMarkerStyle(startMarkerProgress.value, '93, 240, 192'),
)

const endMarkerStyle = computed(() =>
  getMarkerStyle(endMarkerProgress.value, '255, 161, 212'),
)

const storyLabel = computed(() => {
  if (generationProgress.value < 1) {
    return `A maze generating with depth-first search. ${carvedPassages.value} of ${dfsCarves.value.length} passages carved.`
  }
  if (startMarkerProgress.value < 1) {
    return 'The maze is generated and the start marker is being placed.'
  }
  if (endMarkerProgress.value < 1) {
    return 'The start marker is placed and the end marker is being placed.'
  }
  return `A generated maze with ${visibleStep.value} of ${solutionSteps.value} solution steps visible.`
})

const mazeSizeStyle = computed(() => {
  if (mazeSize.value.width === 0 || mazeSize.value.height === 0) {
    return undefined
  }

  return {
    height: `${mazeSize.value.height}px`,
    width: `${mazeSize.value.width}px`,
  }
})

const mazeViewBox = computed(() =>
  mazeRotated.value
    ? '-0.35 -0.35 24.7 40.7'
    : '-0.35 -0.35 40.7 24.7',
)

const mazeTransform = computed(() =>
  mazeRotated.value ? 'matrix(0 1 1 0 0 0)' : undefined,
)

function normalizeProgress(value: number, start: number, end: number): number {
  return Math.min(1, Math.max(0, (value - start) / (end - start)))
}

function easeOutBack(value: number): number {
  const overshoot = 1.70158
  const shifted = value - 1
  return 1 + (overshoot + 1) * shifted ** 3 + overshoot * shifted ** 2
}

function getDisplayPoint(point: Point): Point {
  return mazeRotated.value
    ? { x: point.y, y: point.x }
    : point
}

function getMarkerStyle(dropProgress: number, color: string) {
  const landingProgress = easeOutBack(dropProgress)
  const scale = 1 + (1 - landingProgress) * 3.5
  const shadowRadius = 2 + (1 - dropProgress) * 12

  return {
    filter: `drop-shadow(0 0 ${shadowRadius}px rgba(${color}, ${0.35 + dropProgress * 0.4}))`,
    opacity: String(Math.min(1, dropProgress * 4)),
    transform: `scale(${scale})`,
  }
}

async function generateMazeStory(): Promise<void> {
  const { cellIdToPoint, Mazely } = await import(
    '../../../../packages/core/src/index',
  )
  const randomValues = crypto.getRandomValues(new Uint32Array(3))
  const generationStart = {
    x: randomValues[1] % COLS,
    y: randomValues[2] % ROWS,
  }
  const runtime = new Mazely({
    grid: { cols: COLS, rows: ROWS, type: 'square' },
    seed: `homepage-${randomValues.join('-')}`,
  })
  const generation = runtime.generate('dfs', { start: generationStart })
  generation.finish()

  const carves = generation.steps
    .map((step): DfsCarve | null => {
      if (step.type !== 'carve' || !step.payload.from) {
        return null
      }

      const from = cellIdToPoint(step.payload.from)
      const to = cellIdToPoint(step.payload.to)
      return {
        from,
        to,
        wall: getWallBetween(from, to),
      }
    })
    .filter(carve => carve !== null)

  if (carves.length !== COLS * ROWS - 1) {
    throw new Error('The homepage DFS maze must be a connected spanning tree.')
  }

  const solving = runtime.solve('a-star', {
    end: { x: COLS - 1, y: ROWS - 1 },
    start: { x: 0, y: 0 },
  })
  solving.finish()
  const result = runtime.getSolveResult()

  if (!result?.solved) {
    throw new Error('The homepage maze must have a solution.')
  }

  dfsCarves.value = carves
  dfsParentByKey.value = buildDfsParentMap(carves)
  finalWallPath.value = buildFinalWallPath(carves)
  solutionPoints.value = result.path
}

function buildFinalWallPath(carves: DfsCarve[]): string {
  const walls = new Set<string>()

  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      for (const wall of getCellWalls({ x, y })) {
        walls.add(wall)
      }
    }
  }
  for (const carve of carves) {
    walls.delete(carve.wall)
  }

  return [...walls].join('')
}

function buildDfsParentMap(carves: DfsCarve[]): Map<string, Point> {
  return new Map(
    carves.map(carve => [pointKey(carve.to), carve.from]),
  )
}

function buildGenerationTrail(head: Point): Point[] {
  const trail = [head]
  let parent = dfsParentByKey.value.get(pointKey(head))

  while (parent) {
    trail.push(parent)
    parent = dfsParentByKey.value.get(pointKey(parent))
  }

  return trail.reverse()
}

function getWallBetween(from: Point, to: Point): string {
  if (from.y === to.y) {
    const wallX = Math.max(from.x, to.x)
    return `M${wallX} ${from.y}V${from.y + 1}`
  }

  const wallY = Math.max(from.y, to.y)
  return `M${from.x} ${wallY}H${from.x + 1}`
}

function getCellWalls(cell: Point): string[] {
  return [
    `M${cell.x} ${cell.y}H${cell.x + 1}`,
    `M${cell.x + 1} ${cell.y}V${cell.y + 1}`,
    `M${cell.x} ${cell.y + 1}H${cell.x + 1}`,
    `M${cell.x} ${cell.y}V${cell.y + 1}`,
  ]
}

function pointKey(point: Point): string {
  return `${point.y}:${point.x}`
}

function updateProgress(): void {
  animationFrame = 0
  if (reducedMotionQuery?.matches) {
    storyProgress.value = 1
    return
  }

  const section = scrollSection.value
  const frame = stickyFrame.value
  if (!section || !frame) {
    return
  }

  const rect = section.getBoundingClientRect()
  const stickyTop = Number.parseFloat(getComputedStyle(frame).top) || 0
  const availableTravel = Math.max(1, section.offsetHeight - frame.offsetHeight)
  const endHoldDistance = frame.offsetHeight * END_HOLD_VIEWPORT_RATIO
  const solveTravel = Math.max(1, availableTravel - endHoldDistance)
  storyProgress.value = Math.min(1, Math.max(0, (stickyTop - rect.top) / solveTravel))
}

function updateMazeSize(): void {
  const canvas = mazeCanvas.value
  if (!canvas) {
    return
  }

  const availableWidth = canvas.clientWidth
  const availableHeight = canvas.clientHeight
  const mazeAspectRatio = 40.7 / 24.7
  mazeRotated.value = availableHeight > availableWidth

  if (mazeRotated.value) {
    const rotatedAspectRatio = 1 / mazeAspectRatio
    const rotatedWidth = Math.min(availableWidth, availableHeight * rotatedAspectRatio)
    mazeSize.value = {
      height: rotatedWidth / rotatedAspectRatio,
      width: rotatedWidth,
    }
    return
  }

  const width = Math.min(availableWidth, availableHeight * mazeAspectRatio)
  mazeSize.value = { height: width / mazeAspectRatio, width }
}

function queueProgressUpdate(): void {
  if (animationFrame !== 0) {
    return
  }
  animationFrame = window.requestAnimationFrame(updateProgress)
}

onMounted(() => {
  reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  void generateMazeStory()
  mazeResizeObserver = new ResizeObserver(updateMazeSize)
  if (mazeCanvas.value) {
    mazeResizeObserver.observe(mazeCanvas.value)
  }
  window.addEventListener('scroll', queueProgressUpdate, { passive: true })
  window.addEventListener('resize', queueProgressUpdate)
  reducedMotionQuery.addEventListener('change', queueProgressUpdate)
  updateMazeSize()
  updateProgress()
})

onBeforeUnmount(() => {
  mazeResizeObserver?.disconnect()
  window.removeEventListener('scroll', queueProgressUpdate)
  window.removeEventListener('resize', queueProgressUpdate)
  reducedMotionQuery?.removeEventListener('change', queueProgressUpdate)
  if (animationFrame !== 0) {
    window.cancelAnimationFrame(animationFrame)
  }
})
</script>

<template>
  <section
    ref="scrollSection"
    class="maze-scroll-story"
    data-maze-scroll-story
    aria-label="Scroll-controlled maze generation and solution"
  >
    <div ref="stickyFrame" class="maze-story-frame">
      <div ref="mazeCanvas" class="maze-story-canvas">
        <svg
          :viewBox="mazeViewBox"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          :style="mazeSizeStyle"
          :aria-label="storyLabel"
        >
          <g :transform="mazeTransform">
            <path
              v-if="generationWallPath"
              class="maze-walls"
              :d="generationWallPath"
            />
            <path
              class="maze-solution-glow"
              :d="solutionPath"
              pathLength="100"
              :style="pathStyle"
            />
            <path
              class="maze-solution"
              :d="solutionPath"
              pathLength="100"
              :style="pathStyle"
            />
            <path
              v-if="generationTrailPath"
              class="maze-generation-trail"
              :d="generationTrailPath"
            />
            <circle
              v-if="activeGenerationCarve"
              class="maze-generation-head"
              :cx="activeGenerationCarve.to.x + 0.5"
              :cy="activeGenerationCarve.to.y + 0.5"
              r="0.22"
            />
            <circle
              v-if="solutionProgress > 0.002 && solutionProgress < 0.998"
              class="maze-path-head"
              :cx="currentPoint.x + 0.5"
              :cy="currentPoint.y + 0.5"
              r="0.18"
            />
          </g>
          <circle
            v-if="startMarkerProgress > 0"
            class="maze-marker maze-marker-start"
            :cx="startMarkerPoint.x"
            :cy="startMarkerPoint.y"
            r="0.3"
            :style="startMarkerStyle"
          />
          <circle
            v-if="endMarkerProgress > 0"
            class="maze-marker maze-marker-end"
            :cx="endMarkerPoint.x"
            :cy="endMarkerPoint.y"
            r="0.3"
            :style="endMarkerStyle"
          />
        </svg>
      </div>
    </div>
  </section>
</template>

<style scoped>
.maze-scroll-story {
  --maze-wall-color: var(--vp-c-text-2);

  width: 100vw;
  height: 460svh;
  margin-left: calc(50% - 50vw);
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
}

.maze-story-frame {
  position: sticky;
  top: var(--vp-nav-height);
  height: calc(100svh - var(--vp-nav-height));
  box-sizing: border-box;
  padding: clamp(10px, 1.5vw, 24px);
  overflow: hidden;
}

.maze-story-canvas {
  display: grid;
  width: 100%;
  height: 100%;
  overflow: hidden;
  place-items: center;
}

.maze-story-canvas svg {
  display: block;
  overflow: visible;
}

.maze-walls {
  fill: none;
  stroke: var(--maze-wall-color);
  stroke-linecap: square;
  stroke-linejoin: miter;
  stroke-width: 0.085;
}

.maze-generation-trail {
  fill: none;
  stroke: var(--vp-c-brand-1);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 0.14;
}

.maze-generation-head,
.maze-path-head {
  fill: #00deec;
  filter: drop-shadow(0 0 4px rgba(0, 222, 236, 0.9));
}

.maze-solution,
.maze-solution-glow {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 100;
}

.maze-solution-glow {
  stroke: var(--mazely-brand);
  stroke-width: 0.42;
  opacity: 0.24;
  filter: blur(3px);
}

.maze-solution {
  stroke: var(--vp-c-brand-1);
  stroke-width: 0.17;
}

.maze-marker {
  stroke: none;
  transform-box: fill-box;
  transform-origin: center;
  will-change: opacity, transform;
}

.maze-marker-start {
  fill: #5df0c0;
}

.maze-marker-end {
  fill: #ffa1d4;
}

@media (max-width: 767px) {
  .maze-scroll-story {
    height: 430svh;
  }

  .maze-story-frame {
    padding: 10px 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .maze-scroll-story {
    height: auto;
  }

  .maze-story-frame {
    position: relative;
    top: auto;
    height: min(860px, calc(100svh - var(--vp-nav-height)));
    min-height: 560px;
  }
}
</style>
