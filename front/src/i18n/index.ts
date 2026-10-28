/**
 * vue-i18n setup. Preferred language: the visitor's explicit choice from the footer switch (`cc_locale`, strictly
 * necessary storage), else the browser's language list, else English. Public pages show the language of their URL
 * (`/fr/...` is French) without saving it; the router sends a French-preferring visitor to the `/fr` version.
 */
import { createI18n } from 'vue-i18n'
import { DEFAULT_LOCALE, LOCALES, type Locale } from '../seo/site'
import { messages } from './messages'

const LOCALE_KEY = 'cc_locale'

function readSavedLocale(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_KEY)
    return v && (LOCALES as readonly string[]).includes(v) ? (v as Locale) : null
  } catch {
    return null
  }
}

/** First supported language in the browser's preference order (navigator.languages, e.g. ['fr-FR', 'en']). */
function browserLocale(): Locale {
  if (typeof navigator === 'undefined') return DEFAULT_LOCALE
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of prefs) {
    const base = tag.toLowerCase().split('-')[0]
    if ((LOCALES as readonly string[]).includes(base!)) return base as Locale
  }
  return DEFAULT_LOCALE
}

export function preferredLocale(): Locale {
  return readSavedLocale() ?? browserLocale()
}

export const i18n = createI18n({
  legacy: false,
  locale: preferredLocale(),
  fallbackLocale: DEFAULT_LOCALE,
  messages,
})

export function currentLocale(): Locale {
  return i18n.global.locale.value as Locale
}

export function setLocale(locale: Locale, persist = true) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  if (!persist) return
  try {
    localStorage.setItem(LOCALE_KEY, locale)
  } catch {
    // private mode: the choice just isn't remembered
  }
}
