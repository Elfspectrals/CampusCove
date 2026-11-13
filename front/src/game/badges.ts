import type { UiIconName } from '../components/ui/icons.ts'

export const BADGES = {
  new_citizen: { icon: 'home', overHead: true },
} as const satisfies Record<string, { icon: UiIconName; overHead: boolean }>

export type BadgeCode = keyof typeof BADGES

export function shownBadges(codes: readonly string[] | undefined): BadgeCode[] {
  return (codes ?? []).filter((code): code is BadgeCode => Object.prototype.hasOwnProperty.call(BADGES, code))
}

export function overHeadBadges(badges: readonly BadgeCode[]): BadgeCode[] {
  return badges.filter((badge) => BADGES[badge].overHead)
}
