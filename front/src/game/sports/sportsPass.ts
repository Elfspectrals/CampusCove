export const SPORTS_PASS_KINDS = ['day', 'week'] as const
export type SportsPassKind = (typeof SPORTS_PASS_KINDS)[number]

export const SPORTS_PASS_DESK_REACH = 3
export const NO_PASS_TOAST_GAP_MS = 4000
const NO_PASS_REASON = 'no_pass'

export function passValid(validUntil: number | null, now: number): boolean {
  return validUntil !== null && validUntil > now
}

export function noPassToastDue(reason: string | undefined, lastToastAt: number | null, now: number): boolean {
  if (reason !== NO_PASS_REASON) return false
  return lastToastAt === null || now - lastToastAt >= NO_PASS_TOAST_GAP_MS
}
