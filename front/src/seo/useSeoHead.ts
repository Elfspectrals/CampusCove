/**
 * Runtime <head> manager: after each navigation, rewrites the tags marked `data-seo` (the same ones the build
 * prerender writes) so client-side navigation keeps title, description, canonical, hreflang and robots right.
 * Pages outside the SEO catalog (auth, lobby, game, admin) get `noindex`.
 */
import type { RouteLocationNormalized } from 'vue-router'
import { headForPage, seoPageByRouteName } from './pages'
import { SITE } from './site'
import type { Locale } from './site'

function setTag(tag: 'meta' | 'link', attrs: Record<string, string>) {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  el.setAttribute('data-seo', '')
  document.head.appendChild(el)
}

export function applySeoHead(to: RouteLocationNormalized, uiLocale: Locale) {
  document.head.querySelectorAll('[data-seo]').forEach((el) => el.remove())
  const match = to.name ? seoPageByRouteName(String(to.name)) : null
  const origin = import.meta.env.VITE_SITE_URL || SITE.url

  if (!match) {
    const title = typeof to.meta.title === 'string' ? `${to.meta.title} | ${SITE.name}` : SITE.name
    document.title = title
    document.documentElement.lang = uiLocale
    setTag('meta', { name: 'robots', content: 'noindex, nofollow' })
    return
  }

  const h = headForPage(match.page, match.locale, origin)
  document.title = h.title
  document.documentElement.lang = h.lang
  setTag('meta', { name: 'description', content: h.description })
  setTag('meta', { name: 'robots', content: h.robots })
  setTag('link', { rel: 'canonical', href: h.canonical })
  for (const a of h.alternates) setTag('link', { rel: 'alternate', hreflang: a.hreflang, href: a.href })
  // same set as the build prerender (render.ts headTags), so the first navigation does not drop any of them
  setTag('meta', { property: 'og:type', content: 'website' })
  setTag('meta', { property: 'og:site_name', content: SITE.name })
  setTag('meta', { property: 'og:title', content: h.title })
  setTag('meta', { property: 'og:description', content: h.description })
  setTag('meta', { property: 'og:url', content: h.canonical })
  setTag('meta', { property: 'og:image', content: h.ogImage })
  setTag('meta', { property: 'og:image:width', content: '1200' })
  setTag('meta', { property: 'og:image:height', content: '630' })
  setTag('meta', { property: 'og:locale', content: h.ogLocale })
  setTag('meta', { name: 'twitter:card', content: 'summary_large_image' })
  setTag('meta', { name: 'twitter:title', content: h.title })
  setTag('meta', { name: 'twitter:description', content: h.description })
  setTag('meta', { name: 'twitter:image', content: h.ogImage })
  for (const j of h.jsonLd) {
    const s = document.createElement('script')
    s.type = 'application/ld+json'
    s.setAttribute('data-seo', '')
    s.textContent = JSON.stringify(j)
    document.head.appendChild(s)
  }
}
