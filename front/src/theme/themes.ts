export const THEME_IDS = ['lobby', 'arcade', 'bd', 'tactical', 'console', 'cosy'] as const

export type ThemeId = (typeof THEME_IDS)[number]

export const DEFAULT_THEME: ThemeId = 'lobby'

export const THEME_STORAGE_KEY = 'cc.theme'

function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

export function parseTheme(raw: string | null): ThemeId {
  return isThemeId(raw) ? raw : DEFAULT_THEME
}
