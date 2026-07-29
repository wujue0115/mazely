import type { DefaultTheme } from 'vitepress'
import { defineConfig } from 'vitepress'
import { version } from '../../packages/mazely/package.json'
import { transformSeoPageData } from './seo'

const guideSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'Getting Started',
    items: [
      { text: 'Introduction', link: '/guide/' },
      { text: 'Installation', link: '/guide/installation' },
      { text: 'Quick Start', link: '/guide/quick-start' },
      { text: 'Core Concepts', link: '/guide/core-concepts' },
    ],
  },
  {
    text: 'Algorithms',
    items: [
      { text: 'Overview', link: '/algorithms/' },
      { text: 'Generation', link: '/algorithms/generation' },
      { text: 'Solving', link: '/algorithms/solving' },
    ],
  },
  {
    text: 'Application Patterns',
    items: [
      { text: 'Overview', link: '/recipes/' },
      { text: 'Animating Progress', link: '/recipes/animation' },
      { text: 'Custom Renderer', link: '/recipes/custom-renderer' },
      { text: 'Shaped Mazes', link: '/recipes/masked-maze' },
      { text: 'Saving & Restoring', link: '/recipes/save-and-restore' },
    ],
  },
]

const apiSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: 'API Reference',
    items: [
      { text: 'Overview', link: '/api/' },
      { text: 'Mazely', link: '/api/mazely' },
      { text: 'StepPlayer', link: '/api/step-player' },
      { text: 'Steps & Payloads', link: '/api/steps' },
      { text: 'Grid & Graph', link: '/api/grid' },
      { text: 'Editing', link: '/api/editing' },
      { text: 'Events & State', link: '/api/events' },
      { text: 'Serialization', link: '/api/serialization' },
    ],
  },
]

export default defineConfig({
  lang: 'en-US',
  title: 'Mazely',
  titleTemplate: ':title | Mazely',
  description: 'A TypeScript toolkit for deterministic maze generation, solving, editing, and serialization.',
  cleanUrls: true,
  lastUpdated: true,
  sitemap: {
    hostname: 'https://mazely.dev',
  },
  head: [
    ['link', { rel: 'icon', href: '/favicon.png', type: 'image/png' }],
    ['meta', { name: 'theme-color', content: '#111317' }],
    ['meta', { name: 'author', content: 'Wujue' }],
    ['meta', { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' }],
  ],
  transformPageData: transformSeoPageData,
  themeConfig: {
    logo: {
      light: '/logo.svg',
      dark: '/logo-dark.svg',
      alt: 'Mazely logo',
    },
    siteTitle: 'Mazely',
    nav: [
      {
        text: 'Guide',
        link: '/guide/',
        activeMatch: '^/(guide|algorithms|recipes)/',
      },
      {
        text: 'API',
        link: '/api/',
        activeMatch: '^/(api|reference)/',
      },
      {
        text: 'Studio',
        link: 'https://studio.mazely.dev',
        target: '_blank',
      },
      {
        text: `v${version}`,
        items: [
          {
            text: 'Release Notes',
            link: 'https://github.com/wujue0115/mazely/releases',
          },
          {
            text: 'Contributing',
            link: 'https://github.com/wujue0115/mazely/blob/main/CONTRIBUTING.md',
          },
        ],
      },
    ],
    sidebar: {
      '/guide/': guideSidebar,
      '/algorithms/': guideSidebar,
      '/recipes/': guideSidebar,
      '/api/': apiSidebar,
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/wujue0115/mazely' },
    ],
    search: {
      provider: 'local',
    },
    editLink: {
      pattern: 'https://github.com/wujue0115/mazely/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-PRESENT Wujue',
    },
    outline: {
      level: [2, 3],
      label: 'On this page',
    },
  },
})
