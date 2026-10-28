/**
 * Static HTML for the build-time prerender: the <head> tags of a page and a semantic snapshot of its content,
 * put inside #app so crawlers and link previews see real text before Vue mounts (Vue replaces it on mount).
 */
import { legalEn } from '../content/legal/en'
import { legalFr } from '../content/legal/fr'
import { LEGAL_SLUGS } from '../content/legal/types'
import { marketing } from '../content/marketing'
import type { HeadData, SeoPage } from './pages'
import { SITE, localePrefix, type Locale } from './site'

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function headTags(h: HeadData): string {
  const tags = [
    `<title>${esc(h.title)}</title>`,
    `<meta name="description" content="${esc(h.description)}" data-seo>`,
    `<meta name="robots" content="${esc(h.robots)}" data-seo>`,
    `<link rel="canonical" href="${esc(h.canonical)}" data-seo>`,
    ...h.alternates.map((a) => `<link rel="alternate" hreflang="${a.hreflang}" href="${esc(a.href)}" data-seo>`),
    `<meta property="og:type" content="website" data-seo>`,
    `<meta property="og:site_name" content="${SITE.name}" data-seo>`,
    `<meta property="og:title" content="${esc(h.title)}" data-seo>`,
    `<meta property="og:description" content="${esc(h.description)}" data-seo>`,
    `<meta property="og:url" content="${esc(h.canonical)}" data-seo>`,
    `<meta property="og:image" content="${esc(h.ogImage)}" data-seo>`,
    `<meta property="og:image:width" content="1200" data-seo>`,
    `<meta property="og:image:height" content="630" data-seo>`,
    `<meta property="og:locale" content="${h.ogLocale}" data-seo>`,
    `<meta name="twitter:card" content="summary_large_image" data-seo>`,
    `<meta name="twitter:title" content="${esc(h.title)}" data-seo>`,
    `<meta name="twitter:description" content="${esc(h.description)}" data-seo>`,
    `<meta name="twitter:image" content="${esc(h.ogImage)}" data-seo>`,
    ...h.jsonLd.map((j) => `<script type="application/ld+json" data-seo>${JSON.stringify(j).replace(/</g, '\\u003c')}</script>`),
  ]
  return tags.join('\n    ')
}

const legal = { en: legalEn, fr: legalFr }

function href(locale: Locale, path: string): string {
  return `${localePrefix(locale)}${path}` || '/'
}

function footerNav(locale: Locale): string {
  const links = LEGAL_SLUGS.map((s) => `<a href="${href(locale, `/legal/${s}`)}">${esc(legal[locale][s].title)}</a>`)
  return `<footer><nav>${links.join(' · ')}</nav></footer>`
}

/** Text content of a page, mirrors what the Vue view renders. */
export function bodySnapshot(page: SeoPage, locale: Locale): string {
  const m = marketing[locale]
  const parts: string[] = []
  const nav = [
    `<a href="${href(locale, '')}">${SITE.name}</a>`,
    `<a href="${href(locale, '/shop-skin')}">${locale === 'fr' ? 'Skins' : 'Skins'}</a>`,
    `<a href="/register">${locale === 'fr' ? 'Jouer gratuitement' : 'Play free'}</a>`,
  ]
  parts.push(`<header><nav>${nav.join(' · ')}</nav></header><main>`)
  if (page.routeName === 'landing') {
    parts.push(`<h1>${esc(m.heroTitle)}</h1><p>${esc(m.heroLead)}</p>`)
    parts.push(...m.features.map((f) => `<section><h2>${esc(f.title)}</h2><p>${esc(f.body)}</p></section>`))
    parts.push(`<section><h2>${esc(m.faqTitle)}</h2>${m.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')}</section>`)
  } else if (page.routeName === 'shop-skin') {
    parts.push(`<h1>${esc(m.shop.title)}</h1><p>${esc(m.shop.lead)}</p><section><h2>${esc(m.shop.aboutTitle)}</h2>`)
    parts.push(...m.shop.sections.map((s) => `<h3>${esc(s.title)}</h3><p>${esc(s.body)}</p>`))
    parts.push('</section>')
  } else if (page.legalSlug) {
    const doc = legal[locale][page.legalSlug]
    parts.push(`<article><h1>${esc(doc.title)}</h1><p>${esc(doc.description)}</p>`)
    for (const s of doc.sections) {
      parts.push(`<h2>${esc(s.heading)}</h2>`)
      for (const p of s.paragraphs ?? []) parts.push(`<p>${esc(p)}</p>`)
      if (s.items?.length) parts.push(`<ul>${s.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`)
    }
    parts.push('</article>')
  } else {
    parts.push(`<h1>${esc(page.title[locale].split(' | ')[0] ?? page.title[locale])}</h1><p>${esc(page.description[locale])}</p>`)
  }
  parts.push(`</main>${footerNav(locale)}`)
  return parts.join('')
}

