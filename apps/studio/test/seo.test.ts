import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const studioRoot = resolve(import.meta.dirname, '..')

describe('studio SEO metadata', () => {
  it('publishes canonical, social, and structured metadata', async () => {
    const html = await readFile(resolve(studioRoot, 'index.html'), 'utf8')

    expect(html).toContain('<link rel="canonical" href="https://studio.mazely.dev/" />')
    expect(html).toMatch(/<meta\s+name="description"/)
    expect(html).toMatch(/<meta\s+property="og:title"/)
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />')
    expect(html).toContain('<meta property="og:image" content="https://studio.mazely.dev/og-image.png" />')
    expect(html).toContain('<meta property="og:image:width" content="1200" />')
    expect(html).toContain('<meta property="og:image:height" content="630" />')
    expect(html).toContain('<script type="application/ld+json">')
    expect(html).toContain('<h1 class="top-nav-brand">')
    expect(html).toContain('<span id="package-version" class="top-nav-version">v0.3.0</span>')
  })

  it('publishes crawler discovery files for the production origin', async () => {
    const [ogImage, robots, sitemap] = await Promise.all([
      readFile(resolve(studioRoot, 'public/og-image.png')),
      readFile(resolve(studioRoot, 'public/robots.txt'), 'utf8'),
      readFile(resolve(studioRoot, 'public/sitemap.xml'), 'utf8'),
    ])

    expect(ogImage.subarray(1, 4).toString()).toBe('PNG')
    expect(robots).toContain('Sitemap: https://studio.mazely.dev/sitemap.xml')
    expect(sitemap).toContain('<loc>https://studio.mazely.dev/</loc>')
  })
})
