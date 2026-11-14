import { SPORTS_SITE_ZONE } from './sportsConstants.ts'

const SPORTS_ZONE_PREFIX = 'sports_'

export function countsForExplorer(zone: string): boolean {
  return !zone.startsWith(SPORTS_ZONE_PREFIX) || zone === SPORTS_SITE_ZONE
}
