import type { HeadConfig, PageData } from 'vitepress'
import { version } from '../../packages/mazely/package.json'

const SITE_URL = 'https://mazely.dev'
const SITE_NAME = 'Mazely'
const DEFAULT_DESCRIPTION = 'Generate, solve, edit, and visualize mazes with a deterministic, reversible TypeScript engine.'
const SOCIAL_IMAGE_URL = `${SITE_URL}/og-image.png`
const SOURCE_URL = 'https://github.com/wujue0115/mazely'
const AUTHOR_URL = 'https://github.com/wujue0115'

function getCanonicalUrl(relativePath: string): string {
  const pathname = relativePath
    .replace(/(^|\/)index\.md$/, '$1')
    .replace(/\.md$/, '')

  return new URL(pathname, `${SITE_URL}/`).href
}

function getPageTitle(pageData: PageData): string {
  if (pageData.frontmatter.layout === 'home') {
    return 'Mazely - Maze Generation and Solving for TypeScript'
  }

  return `${pageData.title} | ${SITE_NAME}`
}

function getStructuredData(pageData: PageData, canonicalUrl: string) {
  const author = {
    '@type': 'Person',
    '@id': `${AUTHOR_URL}#person`,
    'name': 'Wujue',
    'url': AUTHOR_URL,
  }
  const software = {
    '@type': 'SoftwareSourceCode',
    '@id': `${SITE_URL}/#software`,
    'name': SITE_NAME,
    'description': DEFAULT_DESCRIPTION,
    'codeRepository': SOURCE_URL,
    'programmingLanguage': 'TypeScript',
    'runtimePlatform': 'Node.js',
    'license': 'https://opensource.org/license/mit',
    version,
    author,
  }
  const website = {
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    'url': `${SITE_URL}/`,
    'name': SITE_NAME,
    'description': DEFAULT_DESCRIPTION,
    'inLanguage': 'en-US',
    author,
  }

  if (pageData.frontmatter.layout === 'home') {
    return {
      '@context': 'https://schema.org',
      '@graph': [website, software],
    }
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    'headline': pageData.title,
    'description': pageData.description || DEFAULT_DESCRIPTION,
    'url': canonicalUrl,
    'mainEntityOfPage': canonicalUrl,
    'inLanguage': 'en-US',
    'isPartOf': {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      'url': `${SITE_URL}/`,
      'name': SITE_NAME,
    },
    'about': {
      '@type': 'SoftwareSourceCode',
      '@id': `${SITE_URL}/#software`,
      'name': SITE_NAME,
      'codeRepository': SOURCE_URL,
    },
    author,
  }
}

export function transformSeoPageData(pageData: PageData): void {
  const canonicalUrl = getCanonicalUrl(pageData.relativePath)
  const description = pageData.description || DEFAULT_DESCRIPTION
  const title = getPageTitle(pageData)
  const structuredData = getStructuredData(pageData, canonicalUrl)
  const isHome = pageData.frontmatter.layout === 'home'

  pageData.frontmatter.head ??= []

  const head = pageData.frontmatter.head as HeadConfig[]
  head.push(
    ['link', { rel: 'canonical', href: canonicalUrl }],
    ['meta', { property: 'og:type', content: isHome ? 'website' : 'article' }],
    ['meta', { property: 'og:site_name', content: SITE_NAME }],
    ['meta', { property: 'og:locale', content: 'en_US' }],
    ['meta', { property: 'og:title', content: title }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:url', content: canonicalUrl }],
    ['meta', { property: 'og:image', content: SOCIAL_IMAGE_URL }],
    ['meta', { property: 'og:image:secure_url', content: SOCIAL_IMAGE_URL }],
    ['meta', { property: 'og:image:type', content: 'image/png' }],
    ['meta', { property: 'og:image:width', content: '1200' }],
    ['meta', { property: 'og:image:height', content: '630' }],
    ['meta', { property: 'og:image:alt', content: 'Mazely — reversible maze algorithms for TypeScript' }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:site', content: '@wujue0115' }],
    ['meta', { name: 'twitter:creator', content: '@wujue0115' }],
    ['meta', { name: 'twitter:title', content: title }],
    ['meta', { name: 'twitter:description', content: description }],
    ['meta', { name: 'twitter:image', content: SOCIAL_IMAGE_URL }],
    ['meta', { name: 'twitter:image:alt', content: 'Mazely — reversible maze algorithms for TypeScript' }],
    ['script', { type: 'application/ld+json' }, JSON.stringify(structuredData).replaceAll('<', '\\u003c')],
  )
}
