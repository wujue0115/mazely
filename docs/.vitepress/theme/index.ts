import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import HomeScrollCue from './components/HomeScrollCue.vue'
import MazeScrollStory from './components/MazeScrollStory.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('HomeScrollCue', HomeScrollCue)
    app.component('MazeScrollStory', MazeScrollStory)
  },
} satisfies Theme
