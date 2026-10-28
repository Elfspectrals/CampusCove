/**
 * Catalog of public, indexable pages: one entry per page, translated title/description, path without locale prefix.
 * Shared by the runtime head manager (useSeoHead) and the build-time prerender + sitemap (vite.config.ts).
 */
import { legalEn } from '../content/legal/en'
import { legalFr } from '../content/legal/fr'
import { LEGAL_SLUGS, type LegalSlug } from '../content/legal/types'
import { marketing } from '../content/marketing'
import { LOCALES, SITE, localePrefix, type Locale } from './site'

export interface SeoPage {
  /** Route name of the English page; the French route is `fr-${name}`. */
  routeName: string
  /** Path without locale prefix, '' for the home page. */
  path: string
  title: Record<Locale, string>
  description: Record<Locale, string>
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly'
  priority: number
  /** Last real content change (ISO date), sitemap lastmod. */
  lastmod: string
  legalSlug?: LegalSlug
}

const legal = { en: legalEn, fr: legalFr }

export const SEO_PAGES: SeoPage[] = [
  {
    routeName: 'landing',
    path: '',
    title: { en: marketing.en.heroTitle, fr: marketing.fr.heroTitle },
    description: {
      en: 'Play CampusCove for free in your browser: explore a multiplayer 3D campus town, rent and furnish your loft, unlock skins and hang out with friends. No download.',
      fr: 'Joue gratuitement à CampusCove dans ton navigateur : explore une ville campus 3D multijoueur, loue et meuble ton loft, débloque des skins et retrouve tes amis. Sans téléchargement.',
    },
    changefreq: 'weekly',
    priority: 1,
    lastmod: SITE.contentUpdated,
  },
  {
    routeName: 'shop-skin',
    path: '/shop-skin',
    title: { en: 'Skin shop — outfits and cosmetics | CampusCove', fr: 'Boutique de skins — tenues et cosmétiques | CampusCove' },
    description: {
      en: 'Browse every CampusCove skin and cosmetic: five rarities, 3D preview, unlocked with coins earned in game. No real-money purchase.',
      fr: 'Découvre tous les skins et cosmétiques de CampusCove : cinq raretés, aperçu 3D, déblocage avec les pièces gagnées en jeu. Aucun achat réel.',
    },
    changefreq: 'weekly',
    priority: 0.7,
    lastmod: SITE.contentUpdated,
  },
  ...LEGAL_SLUGS.map<SeoPage>((slug) => ({
    routeName: `legal-${slug}`,
    path: `/legal/${slug}`,
    title: { en: `${legal.en[slug].title} | ${SITE.name}`, fr: `${legal.fr[slug].title} | ${SITE.name}` },
    description: { en: legal.en[slug].description, fr: legal.fr[slug].description },
    changefreq: 'yearly',
    priority: 0.3,
    lastmod: SITE.legalVersion,
    legalSlug: slug,
  })),
]

export function seoPageByRouteName(name: string): { page: SeoPage; locale: Locale } | null {
  const locale: Locale = name.startsWith('fr-') ? 'fr' : 'en'
  const base = locale === 'fr' ? name.slice(3) : name
  const page = SEO_PAGES.find((p) => p.routeName === base)
  return page ? { page, locale } : null
}

export function pageUrl(page: SeoPage, locale: Locale, origin: string = SITE.url): string {
  const path = `${localePrefix(locale)}${page.path}`
  return `${origin}${path || '/'}`
}

export interface HeadData {
  lang: Locale
  title: string
  description: string
  canonical: string
  robots: string
  alternates: Array<{ hreflang: string; href: string }>
  ogLocale: string
  ogImage: string
  jsonLd: unknown[]
}

/** Every tag of an indexable page, ready to render (as HTML at build, as DOM nodes at runtime). */
export function headForPage(page: SeoPage, locale: Locale, origin: string = SITE.url): HeadData {
  const canonical = pageUrl(page, locale, origin)
  const alternates = [
    ...LOCALES.map((l) => ({ hreflang: l, href: pageUrl(page, l, origin) })),
    { hreflang: 'x-default', href: pageUrl(page, 'en', origin) },
  ]
  const jsonLd: unknown[] = []
  if (page.routeName === 'landing') {
    jsonLd.push(
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: SITE.name,
        url: `${origin}/`,
        inLanguage: ['en', 'fr'],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'VideoGame',
        name: SITE.name,
        url: canonical,
        description: page.description[locale],
        image: `${origin}${SITE.ogImage}`,
        genre: ['Social simulation', 'Life simulation', 'MMO'],
        gamePlatform: ['Web browser'],
        applicationCategory: 'Game',
        operatingSystem: 'Any (WebGL browser)',
        playMode: 'MultiPlayer',
        inLanguage: ['en', 'fr'],
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        author: { '@type': 'Person', name: SITE.publisher.name },
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: marketing[locale].faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    )
  } else {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: SITE.name, item: `${origin}${localePrefix(locale) || '/'}` },
        { '@type': 'ListItem', position: 2, name: page.title[locale].split(' | ')[0], item: canonical },
      ],
    })
  }
  return {
    lang: locale,
    title: page.title[locale],
    description: page.description[locale],
    canonical,
    robots: 'index, follow, max-image-preview:large',
    alternates,
    ogLocale: locale === 'fr' ? 'fr_FR' : 'en_US',
    ogImage: `${origin}${SITE.ogImage}`,
    jsonLd,
  }
}
