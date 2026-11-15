import { readAthleticsPitch, readSportRules } from '../world.ts'
import { gymAreaBusy, registerGymVenue } from './gym.ts'
import { addGymFreeCourt } from './gymFree.ts'
import { parseGymCourt } from './gymCourt.ts'
import { gymPlayerRules, parseFootballRules } from './gymRules.ts'
import { parseRunningRules } from './runningRace.ts'
import { ATHLETICS_FIELD, RUNNING_COACH, RUNNING_VENUE, RUNNING_ZONE, runningVenue } from './runningVenue.ts'
import { parseSignupRules } from './signup.ts'
import { registerCoach, registerVenue } from './venues.ts'

export const ATHLETICS_FOOTBALL = 'athletics_football'

export async function loadAthleticsVenues(): Promise<void> {
  const [runningRaw, footballRaw, pitchRaw] = await Promise.all([readSportRules('running'), readSportRules('football'), readAthleticsPitch()])
  const rules = parseRunningRules(runningRaw)
  const pitch = parseGymCourt(pitchRaw)
  if (pitch.walls) throw new Error('sports/athletics/pitch.json: the outdoor pitch has no walls')
  if (pitch.coach.x !== rules.coach.x || pitch.coach.z !== rules.coach.z) throw new Error('sports/athletics/pitch.json: the coach is not where running.json puts the athletics coach')
  const football = gymPlayerRules(footballRaw, 'football')
  const footballRules = parseFootballRules(footballRaw)
  registerVenue(runningVenue(rules, parseSignupRules(runningRaw, 'sports/rules/running.json')))
  registerGymVenue({
    id: ATHLETICS_FOOTBALL,
    zone: RUNNING_ZONE,
    playAreaId: ATHLETICS_FIELD,
    court: pitch,
    rules: footballRules,
    settings: parseSignupRules(footballRaw, 'sports/rules/football.json').settings,
    minPlayers: football.minPlayers,
    rejoinGraceMs: football.rejoinGraceMs
  })
  registerCoach({ id: RUNNING_COACH, x: rules.coach.x, z: rules.coach.z, venues: [RUNNING_VENUE, ATHLETICS_FOOTBALL] })
  addGymFreeCourt({ id: 'athletics', court: pitch, rules: { football: footballRules }, zone: RUNNING_ZONE, busy: (room) => gymAreaBusy(room, ATHLETICS_FIELD) || room.sports.matches.has(RUNNING_VENUE) })
}
