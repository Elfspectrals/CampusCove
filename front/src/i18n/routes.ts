/** Locale-aware route names: public SEO pages exist as `name` (English) and `fr-name` (French). */
import type { RouteLocationRaw } from 'vue-router'
import { SEO_PAGES } from '../seo/pages'
import type { Locale } from '../seo/site'

const localized = new Set(SEO_PAGES.map((p) => p.routeName))

export function localizedName(name: string, locale: Locale): string {
  const base = name.startsWith('fr-') ? name.slice(3) : name
  if (!localized.has(base)) return name
  return locale === 'fr' ? `fr-${base}` : base
}

export function localizedTo(name: string, locale: Locale): RouteLocationRaw {
  return { name: localizedName(name, locale) }
}
