import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { api, clientOf, fakeRoom, installWorld, json, makePlayer, manifest, sentOf } from './testWorld.ts'

const RAW = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/running.json', import.meta.url), 'utf8'))
manifest.bounds = { minX: -650, maxX: 650, minZ: -650, maxZ: 650 }
const athletics = manifest.zones.find((z) => z.key === 'sports_athletics')
if (!athletics) throw new Error('testWorld has no sports_athletics zone')
athletics.bounds = { minX: -566.5, maxX: -381.5, minZ: -420, maxZ: -310 }
installWorld()
const { loadWorld } = await import('../world.ts')
const venues = await import('./venues.ts')
const { parseRunningRules } = await import('./runningRace.ts')
const { parseSignupRules } = await import('./signup.ts')
const running = await import('./runningVenue.ts')
const { addGymFreeCourt } = await import('./gymFree.ts')
const { onGymBall, tickGym } = await import('./gym.ts')
const { parseGymCourt } = await import('./gymCourt.ts')
const { parseFootballRules } = await import('./gymRules.ts')
const { KICKOFF_COUNTDOWN_MS } = await import('./sportsConstants.ts')
await loadWorld()

const rules = parseRunningRules(RAW)
venues.registerVenue(running.runningVenue(rules, parseSignupRules(RAW, 'running.json'), () => 0))
venues.registerCoach({ id: running.RUNNING_COACH, x: rules.coach.x, z: rules.coach.z, venues: [running.RUNNING_VENUE] })
const PITCH = parseGymCourt(JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/athletics/pitch.json', import.meta.url), 'utf8')))
const FOOTBALL_RAW = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/football.json', import.meta.url), 'utf8'))
addGymFreeCourt({ id: 'athletics_test', court: PITCH, rules: { football: parseFootballRules(FOOTBALL_RAW) }, zone: 'sports_athletics', busy: (room) => room.sports.matches.has(running.RUNNING_VENUE) })
api.replies.set('GET /sports/gear', () => json({ gear: ['gear_running_spikes'] }))
api.replies.set('POST /sports/matches', () => json({ match: { id: 1, recorded: true } }))

const NOW = 9_000_000

test('a solo 100 m: sign-up with spikes, runner placed on the line, steps judged by the socket, result recorded', async () => {
  const runner = await makePlayer(7, rules.coach.x, rules.coach.z + 1)
  runner.sportsPassUntil = NOW * 10
  const room = await fakeRoom([runner])
  const client = clientOf(room, runner)
  await venues.onSportsSignup(room, client, { coach: running.RUNNING_COACH, venue: running.RUNNING_VENUE, settings: { distanceM: 100 } }, NOW)
  assert.equal(room.sports.lobbies.get(running.RUNNING_VENUE)?.phase, 'countdown')
  const kickoff = NOW + KICKOFF_COUNTDOWN_MS
  venues.tickSports(room, kickoff)
  assert.equal(running.isRacing(room, runner), true)
  assert.deepEqual(sentOf(client, 'position_correction').at(-1), { x: runner.x, y: runner.y, z: runner.z, reason: 'race_start' })
  assert.ok(Math.abs(runner.x - (-531.805 - 0.3)) < 1e-6)
  assert.equal(runner.sportsWear.shoes?.model, running.RUNNING_SPIKES_WORN.model)
  const first = sentOf(client, 'sports_run_state').at(-1) as { phase: string, beepAt: number | null }
  assert.equal(first.phase, 'marks')
  assert.equal(first.beepAt, null)

  const beepAt = kickoff + rules.startBeepDelayRangeMs[0]
  running.onRunLook(room, client, { ry: -Math.PI / 2 + 2 * Math.PI })
  running.onRunLook(room, client, { ry: 'east' })
  let foot = 0
  for (let t = kickoff + 100; t <= beepAt + 20_000 && running.isRacing(room, runner); t += 10) {
    if (t > beepAt && (t - beepAt) % 170 === 0) running.onRunStep(room, client, { foot: foot++ % 2 ? 'right' : 'left' }, t)
    if (t % 100 === 0) venues.tickSports(room, t)
  }
  assert.equal(running.isRacing(room, runner), false)
  assert.equal(room.sports.matches.has(running.RUNNING_VENUE), false)
  assert.equal(runner.sportsWear.shoes, undefined)
  const result = sentOf(client, 'sports_run_result').at(-1) as { results: { result: string, place: number, timeMs: number }[] }
  assert.equal(result.results[0].result, 'finished')
  assert.equal(result.results[0].place, 1)
  await new Promise((resolve) => setImmediate(resolve))
  const posted = api.calls.find((c) => c.url === '/sports/matches')?.body as { sport: string, venue: string, players: unknown[] }
  assert.equal(posted.sport, 'running')
  assert.equal(posted.venue, running.RUNNING_VENUE)
  assert.deepEqual(posted.players, [{ accountId: 7, team: null, result: 'finished', place: 1, timeMs: result.results[0].timeMs }])
})

test('a step before the beep disqualifies and ends a solo race as did not finish', async () => {
  const runner = await makePlayer(8, rules.coach.x, rules.coach.z + 1)
  runner.sportsPassUntil = NOW * 10
  const room = await fakeRoom([runner])
  const client = clientOf(room, runner)
  await venues.onSportsSignup(room, client, { coach: running.RUNNING_COACH, venue: running.RUNNING_VENUE, settings: { distanceM: 400 } }, NOW)
  venues.tickSports(room, NOW + KICKOFF_COUNTDOWN_MS)
  running.onRunStep(room, client, { foot: 'left' }, NOW + KICKOFF_COUNTDOWN_MS + 1000)
  venues.tickSports(room, NOW + KICKOFF_COUNTDOWN_MS + 1100)
  const result = sentOf(client, 'sports_run_result').at(-1) as { results: { result: string, dnf: string }[] }
  assert.deepEqual(result.results.map((r) => [r.result, r.dnf]), [['dnf', 'false_start']])
})

test('a sign-up without running spikes is refused', async () => {
  api.replies.set('GET /sports/gear', () => json({ gear: [] }))
  const runner = await makePlayer(9, rules.coach.x, rules.coach.z + 1)
  runner.sportsPassUntil = NOW * 10
  const room = await fakeRoom([runner])
  await venues.onSportsSignup(room, clientOf(room, runner), { coach: running.RUNNING_COACH, venue: running.RUNNING_VENUE, settings: { distanceM: 100 } }, NOW)
  assert.deepEqual((sentOf(clientOf(room, runner), 'sports_error') as { code: string }[]).map((e) => e.code), ['sports_no_gear'])
})

type FreeState = { balls: { court: string, sport: string, ball: number[] }[] }

test('free play outdoors: the athletics coach lends a football on the pitch, no basketball, and none while a race runs', async () => {
  const p = await makePlayer(41, rules.coach.x, rules.coach.z + 1)
  p.sportsPassUntil = NOW * 10
  const room = await fakeRoom([p])
  const client = clientOf(room, p)
  onGymBall(room, client, { sport: 'basketball' }, NOW)
  assert.equal((sentOf(client, 'gym_error').at(-1) as { code: string }).code, 'gym_no_sport')
  onGymBall(room, client, { sport: 'football' }, NOW)
  const lent = (sentOf(client, 'gym_free').at(-1) as FreeState).balls
  assert.equal(lent.length, 1)
  assert.equal(lent[0].court, 'athletics_test')
  const [x, , z] = lent[0].ball
  assert.ok(x >= PITCH.arena.minX && x <= PITCH.arena.maxX && z >= PITCH.arena.minZ && z <= PITCH.arena.maxZ)
  api.replies.set('GET /sports/gear', () => json({ gear: ['gear_running_spikes'] }))
  await venues.onSportsSignup(room, client, { coach: running.RUNNING_COACH, venue: running.RUNNING_VENUE, settings: { distanceM: 100 } }, NOW + 1000)
  venues.tickSports(room, NOW + 1000 + KICKOFF_COUNTDOWN_MS)
  assert.equal(room.sports.matches.has(running.RUNNING_VENUE), true)
  tickGym(room, NOW + 1100 + KICKOFF_COUNTDOWN_MS)
  assert.deepEqual((sentOf(client, 'gym_free').at(-1) as FreeState).balls, [])
  assert.equal(p.sportsLoans.has('gym_ball'), false)
})
