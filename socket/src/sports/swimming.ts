import { readSportRules } from '../world.ts'
import { POOL_ZONE, poolVenueSpec, usePoolRules } from './poolRace.ts'
import { parseSwimPool } from './poolSwim.ts'
import { configurePoolWater } from './poolWater.ts'
import { registerVenue } from './venues.ts'

export async function loadSwimming(): Promise<void> {
  const raw = await readSportRules('swimming')
  const { rules, spec } = poolVenueSpec(raw)
  configurePoolWater(parseSwimPool(raw, rules), POOL_ZONE)
  usePoolRules(rules)
  registerVenue(spec)
}
