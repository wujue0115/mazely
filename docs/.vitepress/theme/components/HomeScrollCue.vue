<script setup lang="ts">
import { onBeforeUnmount } from 'vue'

let scrollAnimation = 0

function getMazeScrollTarget(
  maze: HTMLElement,
  stickyFrame: HTMLElement,
): number {
  const stickyTop = Number.parseFloat(getComputedStyle(stickyFrame).top) || 0
  return window.scrollY + maze.getBoundingClientRect().top - stickyTop
}

function settleMazePosition(
  maze: HTMLElement,
  stickyFrame: HTMLElement,
): void {
  window.requestAnimationFrame(() => {
    window.scrollTo({
      behavior: 'auto',
      top: getMazeScrollTarget(maze, stickyFrame),
    })
  })
}

function scrollToMaze(): void {
  const maze = document.querySelector<HTMLElement>('[data-maze-scroll-story]')
  const stickyFrame = maze?.querySelector<HTMLElement>('.maze-story-frame')
  if (!maze || !stickyFrame) {
    return
  }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const startTop = window.scrollY

  window.cancelAnimationFrame(scrollAnimation)

  if (reduceMotion) {
    window.scrollTo({
      behavior: 'auto',
      top: getMazeScrollTarget(maze, stickyFrame),
    })
    return
  }

  const startTime = performance.now()
  const duration = 600

  function animate(currentTime: number): void {
    const elapsed = Math.min(1, (currentTime - startTime) / duration)
    const eased = 1 - (1 - elapsed) ** 3
    const targetTop = getMazeScrollTarget(maze, stickyFrame)

    window.scrollTo({
      behavior: 'auto',
      top: startTop + (targetTop - startTop) * eased,
    })

    if (elapsed < 1) {
      scrollAnimation = window.requestAnimationFrame(animate)
      return
    }

    scrollAnimation = 0
    settleMazePosition(maze, stickyFrame)
  }

  scrollAnimation = window.requestAnimationFrame(animate)
}

onBeforeUnmount(() => window.cancelAnimationFrame(scrollAnimation))
</script>

<template>
  <div class="home-scroll-cue-space">
    <button
      class="home-scroll-cue"
      type="button"
      aria-label="Scroll to the maze"
      @click="scrollToMaze"
    >
      <span aria-hidden="true" />
    </button>
  </div>
</template>
