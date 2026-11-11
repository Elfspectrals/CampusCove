import type { ThemeId } from './themes'

type NavLayout = 'bar' | 'side' | 'floating'

type TabMark = 'underline' | 'pill' | 'dot'

type HeroLayout = 'left' | 'center' | 'split' | 'bottom'

export interface ThemeLayout {
  nav: NavLayout
  tabMark: TabMark
  hero: HeroLayout
}

export const THEME_LAYOUTS: Record<ThemeId, ThemeLayout> = {
  lobby: { nav: 'bar', tabMark: 'underline', hero: 'left' },
  arcade: { nav: 'bar', tabMark: 'underline', hero: 'center' },
  bd: { nav: 'bar', tabMark: 'pill', hero: 'split' },
  tactical: { nav: 'side', tabMark: 'underline', hero: 'bottom' },
  console: { nav: 'floating', tabMark: 'pill', hero: 'bottom' },
  cosy: { nav: 'bar', tabMark: 'dot', hero: 'center' },
}
