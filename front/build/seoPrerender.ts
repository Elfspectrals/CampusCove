/**
 * Build-time SEO for the SPA: after `vite build`, writes one static HTML file per public page and locale
 * (head tags + content snapshot inside #app), the app shell for private routes (noindex), 404.html,
 * robots.txt, sitemap.xml (with hreflang) and llms.txt. Vue takes over on load; the snapshot is replaced.
 *
 * Origin comes from VITE_SITE_URL (falls back to SITE.url in src/seo/site.ts).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import { marketing } from '../src/content/marketing'
import { SEO_PAGES, headForPage, pageUrl } from '../src/seo/pages'
import { bodySnapshot, esc, headTags } from '../src/seo/render'
import { LOCALES, SITE, localePrefix, type Locale } from '../src/seo/site'

/**
 * Private routes kept out of crawling. Sign-in pages (/login, /register, /forgot-password) are left crawlable on
 * purpose: they are linked from every public page and carry noindex (X-Robots-Tag in vercel.json + meta), which a
 * crawler can only read if robots.txt lets it fetch them.
 */
const ROBOTS_BLOCKED_PATHS = ['/home', '/locker', '/friends', '/game', '/NewNation', '/admin', '/dev']

function shellHead(title: string): string {
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="robots" content="noindex, nofollow" data-seo>`,
    `<meta name="description" content="${esc(SEO_PAGES[0].description.en)}" data-seo>`,
  ].join('\n    ')
}

/** dist-relative file for a public page: '' → index.html, '/fr' → fr/index.html, '/fr/legal/x' → fr/legal/x.html */
function fileFor(path: string): string {
  if (path === '') return 'index.html'
  if (path === '/fr') return 'fr/index.html'
  return `${path.slice(1)}.html`
}

function sitemap(origin: string): string {
  const urls = SEO_PAGES.flatMap((page) =>
    LOCALES.map((locale) => {
      const alts = [
        ...LOCALES.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${pageUrl(page, l, origin)}"/>`),
        `<xhtml:link rel="alternate" hreflang="x-default" href="${pageUrl(page, 'en', origin)}"/>`,
      ].join('')
      return `<url><loc>${pageUrl(page, locale, origin)}</loc><lastmod>${page.lastmod}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${page.priority.toFixed(1)}</priority>${alts}</url>`
    }),
  )
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`
}

function robots(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    // '$' anchors the match: a bare '/shop' rule would also block the public /shop-skin
    ...ROBOTS_BLOCKED_PATHS.map((p) => `Disallow: ${p}$`),
    ...ROBOTS_BLOCKED_PATHS.map((p) => `Disallow: ${p}/`),
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
}

function llms(origin: string): string {
  const m = marketing.en
  const link = (locale: Locale, path: string, label: string) => `- [${label}](${origin}${`${localePrefix(locale)}${path}` || '/'})`
  return [
    `# ${SITE.name}`,
    '',
    `> ${m.heroLead} Free, browser-based, multiplayer, for players aged ${SITE.minimumAge}+. Non-commercial school project, available in English and French.`,
    '',
    '## Features',
    ...m.features.map((f) => `- ${f.title}: ${f.body}`),
    '',
    '## Pages',
    link('en', '', 'Home (EN)'),
    link('fr', '', 'Accueil (FR)'),
    link('en', '/how-to-play', 'How to play'),
    link('en', '/shop-skin', 'Skin shop'),
    link('en', '/legal/privacy', 'Privacy policy'),
    link('en', '/legal/terms', 'Terms of use'),
    '',
    '## FAQ',
    ...m.faq.map((f) => `- ${f.q} ${f.a}`),
    '',
  ].join('\n')
}

export function seoPrerender(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'campuscove-seo-prerender',
    configResolved(c) {
      config = c
    },
    transformIndexHtml(html) {
      if (config.command !== 'serve') return html
      return html.replace('<!--seo-head-->', shellHead(SITE.name)).replace('<!--seo-body-->', '')
    },
    closeBundle() {
      if (config.command !== 'build') return
      const origin = (process.env.VITE_SITE_URL || SITE.url).replace(/\/$/, '')
      const outDir = config.build.outDir
      const template = readFileSync(join(outDir, 'index.html'), 'utf8')
      const write = (file: string, content: string) => {
        const target = join(outDir, file)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, content)
      }
      const render = (head: string, body: string, lang: Locale) =>
        template.replace('<html lang="en">', `<html lang="${lang}">`).replace('<!--seo-head-->', head).replace('<!--seo-body-->', body)

      // private routes and unknown URLs: bare shell, noindex (written first: index.html is overwritten below)
      write('app.html', render(shellHead(SITE.name), '', 'en'))
      write('404.html', render(shellHead(`Not found | ${SITE.name}`), '', 'en'))

      for (const page of SEO_PAGES) {
        for (const locale of LOCALES) {
          const html = render(headTags(headForPage(page, locale, origin)), bodySnapshot(page, locale), locale)
          write(fileFor(`${localePrefix(locale)}${page.path}`), html)
        }
      }
      write('sitemap.xml', sitemap(origin))
      write('robots.txt', robots(origin))
      write('llms.txt', llms(origin))
      config.logger.info(`[seo] prerendered ${SEO_PAGES.length * LOCALES.length} pages for ${origin}`)
    },
  }
}
