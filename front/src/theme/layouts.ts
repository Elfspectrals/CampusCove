import type { ThemeId } from './themes'

type NavLayout = 'bar' | 'side' | 'floating'

type TabMark = 'underline' | 'pill' | 'dot'

type HeroLayout = 'left' | 'center' | 'split' | 'bottom'

type LobbyLayout = 'columns' | 'banner' | 'feature' | 'stacked' | 'row' | 'profileTop'

export interface ThemeLayout {
  nav: NavLayout
  tabMark: TabMark
  hero: HeroLayout
  lobby: LobbyLayout
}

export const THEME_LAYOUTS: Record<ThemeId, ThemeLayout> = {
  lobby: { nav: 'bar', tabMark: 'underline', hero: 'left', lobby: 'columns' },
  arcade: { nav: 'bar', tabMark: 'underline', hero: 'center', lobby: 'banner' },
  bd: { nav: 'bar', tabMark: 'pill', hero: 'split', lobby: 'feature' },
  tactical: { nav: 'side', tabMark: 'underline', hero: 'bottom', lobby: 'stacked' },
  console: { nav: 'floating', tabMark: 'pill', hero: 'bottom', lobby: 'row' },
  cosy: { nav: 'bar', tabMark: 'dot', hero: 'center', lobby: 'profileTop' },
}
