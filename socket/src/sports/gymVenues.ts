import { readGymCourt, readSportRules } from '../world.ts'
import { GYM_ZONE, registerGymVenue } from './gym.ts'
import { configureGymFreePlay } from './gymFree.ts'
import { parseGymCourt } from './gymCourt.ts'
import { gymPlayerRules, parseBasketballRules, parseFootballRules } from './gymRules.ts'
import { parseSignupRules } from './signup.ts'
import { registerCoach } from './venues.ts'

export async function loadGymVenues(): Promise<void> {
  const [courtRaw, footballRaw, basketballRaw] = await Promise.all([readGymCourt(), readSportRules('football'), readSportRules('basketball')])
  const court = parseGymCourt(courtRaw)
  const football = gymPlayerRules(footballRaw, 'football')
  const basketball = gymPlayerRules(basketballRaw, 'basketball')
  if (football.coachId !== basketball.coachId) throw new Error(`gym coach: football.json says ${football.coachId}, basketball.json says ${basketball.coachId}`)
  const footballRules = parseFootballRules(footballRaw)
  const basketballRules = parseBasketballRules(basketballRaw)
  registerGymVenue({
    id: 'gym_football',
    court,
    rules: footballRules,
    settings: parseSignupRules(footballRaw, 'football').settings,
    minPlayers: football.minPlayers,
    rejoinGraceMs: football.rejoinGraceMs
  })
  registerGymVenue({
    id: 'gym_basketball',
    court,
    rules: basketballRules,
    settings: parseSignupRules(basketballRaw, 'basketball').settings,
    minPlayers: basketball.minPlayers,
    rejoinGraceMs: basketball.rejoinGraceMs
  })
  registerCoach({ id: football.coachId, x: court.coach.x, z: court.coach.z, venues: ['gym_football', 'gym_basketball'] })
  configureGymFreePlay({ court, rules: { football: footballRules, basketball: basketballRules }, zone: GYM_ZONE })
  console.log('[sports] gym venues loaded: football and basketball')
}
