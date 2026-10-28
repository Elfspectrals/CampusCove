/**
 * vue-i18n setup. The locale comes from the URL on public pages (`/fr/...` is French, the rest English) and
 * from the visitor's saved choice (`cc_locale`, strictly necessary storage) or browser language elsewhere.
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

function browserLocale(): Locale {
  return typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('fr') ? 'fr' : DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: readSavedLocale() ?? browserLocale(),
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
