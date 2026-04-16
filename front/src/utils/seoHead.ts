import type { RouteLocationNormalized } from 'vue-router'

const SITE_NAME = 'CampusCove'

const DEFAULT_DESCRIPTION =
  'CampusCove — explore a virtual campus, meet others, customize your avatar, and play together.'

function upsertMetaByName(name: string, content: string): void {
  let el = document.querySelector(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertMetaByProperty(property: string, content: string): void {
  let el = document.querySelector(`meta[property="${property}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('property', property)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function upsertLinkCanonical(href: string): void {
  let el = document.querySelector('link[rel="canonical"]')
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

/** Public origin without trailing slash: env first, then current page origin. */
export function resolvePublicSiteOrigin(): string {
  const explicit = import.meta.env.VITE_PUBLIC_SITE_URL?.trim()
  if (explicit) {
    return explicit.replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return ''
}

/** Pathname for canonical/OG URL, including Vite `BASE_URL` when set. */
export function resolveCanonicalPathname(
  to: RouteLocationNormalized,
  canonicalPathOverride: string | undefined
): string {
  const path =
    typeof canonicalPathOverride === 'string' && canonicalPathOverride.startsWith('/')
      ? canonicalPathOverride
      : to.path
  const baseUrl = import.meta.env.BASE_URL || '/'
  const base = baseUrl.replace(/\/$/, '')
  if (path === '/') {
    return base ? base : '/'
  }
  return base ? `${base}${path}` : path
}

export function documentTitleFromRoute(to: RouteLocationNormalized): string {
  const raw = to.meta.title
  const segment = typeof raw === 'string' && raw.length > 0 ? raw : ''
  return segment ? `${segment} | ${SITE_NAME}` : SITE_NAME
}

export function applyRouteSeo(to: RouteLocationNormalized): void {
  if (typeof document === 'undefined') return

  const fullTitle = documentTitleFromRoute(to)
  document.title = fullTitle

  const description =
    typeof to.meta.description === 'string' && to.meta.description.length > 0
      ? to.meta.description
      : DEFAULT_DESCRIPTION

  const robots =
    typeof to.meta.robots === 'string' && to.meta.robots.length > 0 ? to.meta.robots : 'index,follow'

  const pathname = resolveCanonicalPathname(to, to.meta.canonicalPath)
  const origin = resolvePublicSiteOrigin()
  const absoluteUrl = origin ? `${origin}${pathname}` : ''

  upsertMetaByName('description', description)
  upsertMetaByName('robots', robots)
  upsertMetaByProperty('og:title', fullTitle)
  upsertMetaByProperty('og:description', description)
  upsertMetaByName('twitter:title', fullTitle)
  upsertMetaByName('twitter:description', description)

  if (absoluteUrl) {
    upsertMetaByProperty('og:url', absoluteUrl)
    upsertLinkCanonical(absoluteUrl)
  }
}
