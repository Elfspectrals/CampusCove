const BADGE_CODE = /^[a-z][a-z0-9_:]{0,63}$/

export function parseBadges(raw: unknown): string[] {
  if (!Array.isArray(raw) || !raw.every((badge) => typeof badge === 'string' && BADGE_CODE.test(badge))) {
    throw new Error('invalid badges in auth payload')
  }
  return raw
}
