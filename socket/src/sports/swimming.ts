import { readSportRules } from '../world.ts'
import { POOL_ZONE, poolVenueSpec, usePoolRules } from './poolRace.ts'
import { configurePoolWater } from './poolWater.ts'
import { registerVenue } from './venues.ts'

export async function loadSwimming(): Promise<void> {
  const { rules, spec } = poolVenueSpec(await readSportRules('swimming'))
  configurePoolWater(rules.water, POOL_ZONE)
  usePoolRules(rules)
  registerVenue(spec)
}
