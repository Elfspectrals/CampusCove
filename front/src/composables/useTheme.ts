import { readonly, ref } from 'vue'
import { DEFAULT_THEME, THEME_STORAGE_KEY, parseTheme, type ThemeId } from '../theme/themes'

function load(): ThemeId {
  try {
    return parseTheme(window.localStorage.getItem(THEME_STORAGE_KEY))
  } catch (error) {
    console.warn('Saved theme could not be read, using the default one', error)
    return DEFAULT_THEME
  }
}

function save(theme: ThemeId): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch (error) {
    console.warn('Theme applies to this visit only: it could not be saved', error)
  }
}

function apply(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
}

const current = ref<ThemeId>(load())

export const activeTheme = readonly(current)

export function applySavedTheme(): void {
  apply(current.value)
}

export function setTheme(theme: ThemeId): void {
  current.value = theme
  apply(theme)
  save(theme)
}
