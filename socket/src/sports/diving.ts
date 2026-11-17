import { readSportRules } from '../world.ts'
import { parseDivingRules, useDivingRules } from './poolDiving.ts'
import { POOL_ZONE } from './poolRace.ts'

export async function loadDiving(): Promise<void> {
  useDivingRules(parseDivingRules(await readSportRules('diving')), POOL_ZONE)
}
