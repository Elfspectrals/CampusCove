import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Player } from '../types.ts'
import type { Match } from './signup.ts'
import { COURT, type FakeRoom, api, clientOf, fakeRoom, installWorld, json, makePlayer, sentOf } from './testWorld.ts'

installWorld()
const { loadWorld } = await import('../world.ts')
const { moveRejection } = await import('../movement.ts')
const venues = await import('./venues.ts')
const { KICKOFF_COUNTDOWN_MS } = await import('./sportsConstants.ts')
await loadWorld()

const COACH = { x: -370, z: -161 }
const events: string[] = []
const ended: { match: Match, end: unknown }[] = []

function fakeVenue(id: string, extra: Partial<Parameters<typeof venues.registerVenue>[0]> = {}) {
  venues.registerVenue({
    id,
    sport: 'football',
    zone: 'sports_gym',
    coach: COACH,
    playArea: COURT,
    teams: true,
    settings: [{ key: 'length', label: 'Length', options: [5, 10] }],
    players: (settings) => (settings.length === 5 ? { min: 2, max: 2 } : { min: 2, max: 4 }),
    rejoinGraceMs: 30_000,
    onKickoff: (_room, match) => void events.push(`kickoff ${match.venue}`),
    onTick: () => undefined,
    onLeave: (_room, match, accountId) => void events.push(`leave ${match.venue} ${accountId}`),
    onEnd: (_room, match, end) => void ended.push({ match, end }),
    ...extra
  })
}

fakeVenue('test_court_a')
fakeVenue('test_court_b')
venues.registerCoach({ id: 'test_coach', x: COACH.x, z: COACH.z, venues: ['test_court_a', 'test_court_b'] })
const GYM_COURT = { minX: -379, maxX: -378.6, minZ: -170, maxZ: -169.6 }
fakeVenue('test_gym_football', { playArea: GYM_COURT, playAreaId: 'test_gym_court' })
fakeVenue('test_gym_basketball', { sport: 'basketball', playArea: GYM_COURT, playAreaId: 'test_gym_court' })
venues.registerCoach({ id: 'test_gym_coach', x: COACH.x, z: COACH.z, venues: ['test_gym_football', 'test_gym_basketball'] })
const CONFINED = { minX: -379, maxX: -377, minZ: -185, maxZ: -183 }
fakeVenue('test_confined', { playArea: CONFINED, confined: true })
venues.registerCoach({ id: 'test_confined_coach', x: COACH.x, z: COACH.z, venues: ['test_confined'] })
fakeVenue('test_robot_court', { playArea: { minX: -379, maxX: -378.5, minZ: -175, maxZ: -174.5 }, robots: true })
venues.registerCoach({ id: 'test_robot_coach', x: COACH.x, z: COACH.z, venues: ['test_robot_court'] })
fakeVenue('test_gear_court', { playArea: { minX: -379, maxX: -378.5, minZ: -179, maxZ: -178.5 }, gear: 'gear_boxing_gloves' })

const NOW = 5_000_000

async function signed(count: number): Promise<{ room: FakeRoom, players: Player[] }> {
  const players = await Promise.all(Array.from({ length: count }, (_, i) => makePlayer(100 + i, COACH.x, COACH.z + 1)))
  for (const p of players) p.sportsPassUntil = NOW * 10
  return { room: await fakeRoom(players), players }
}

function errors(room: FakeRoom, player: Player) {
  return sentOf(clientOf(room, player), 'sports_error') as { code: string }[]
}

test('a coach shows its open lobby, or an empty sheet for its first free venue, and refuses from afar', async () => {
  const { room, players: [p] } = await signed(1)
  venues.onSportsCoachOpen(room, clientOf(room, p), { coach: 'test_coach' }, NOW)
  const idle = { coach: 'test_coach', sport: 'football', phase: 'open', settings: null, players: [], min: 2, max: 2, kickoffAt: null, serverNow: NOW }
  assert.deepEqual(sentOf(clientOf(room, p), 'sports_lobby'), [{ venue: 'test_court_a', ...idle }, { venue: 'test_court_b', ...idle }])
  p.x += 5
  venues.onSportsCoachOpen(room, clientOf(room, p), { coach: 'test_coach' }, NOW + 1000)
  assert.equal(errors(room, p).at(-1)?.code, 'sports_too_far')
  venues.onSportsCoachOpen(room, clientOf(room, p), { coach: 'nobody' }, NOW + 2000)
  assert.equal(clientOf(room, p).sent.length, 3)
})

test('a sign-up needs a pass, a team and offered settings', async () => {
  const { room, players: [p] } = await signed(1)
  const client = clientOf(room, p)
  p.sportsPassUntil = null
  await venues.onSportsSignup(room, client, { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 5 } }, NOW)
  p.sportsPassUntil = NOW * 10
  await venues.onSportsSignup(room, client, { coach: 'test_coach', venue: 'test_court_a', settings: { length: 5 } }, NOW + 1000)
  await venues.onSportsSignup(room, client, { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 7 } }, NOW + 2000)
  assert.deepEqual(errors(room, p).map((e) => e.code), ['sports_no_pass', 'sports_bad_settings', 'sports_bad_settings'])
  assert.equal(room.sports.lobbies.size, 0)
})

test('a sign-up or a leave inside the action cooldown is refused with sports_busy, never dropped', async () => {
  const { room, players: [p] } = await signed(1)
  const client = clientOf(room, p)
  venues.onSportsCoachOpen(room, client, { coach: 'test_coach' }, NOW)
  await venues.onSportsSignup(room, client, { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 5 } }, NOW + 100)
  assert.deepEqual(errors(room, p).map((e) => e.code), ['sports_busy'])
  assert.equal(room.sports.lobbies.size, 0)
  await venues.onSportsSignup(room, client, { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 5 } }, NOW + 1000)
  assert.equal(room.sports.lobbies.size, 1)
  venues.onSportsSignupLeave(room, client, NOW + 1100)
  assert.deepEqual(errors(room, p).map((e) => e.code), ['sports_busy', 'sports_busy'])
  assert.equal(room.sports.lobbies.size, 1)
})

test('the first player sets the match, the next join it, and a full lobby kicks off and clears the court', async () => {
  const { room, players: [a, b] } = await signed(2)
  const bystander = await makePlayer(900, -370, -165)
  room.players.set(bystander.sessionId, bystander)
  room.clients.push((await import('./testWorld.ts')).fakeClient(bystander.sessionId))
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 5 } }, NOW)
  const lobby = room.sports.lobbies.get('test_court_a')
  assert.deepEqual(lobby?.settings, { length: 5 })
  assert.deepEqual(sentOf(clientOf(room, bystander), 'sports_lobby').at(-1), {
    venue: 'test_court_a', coach: 'test_coach', sport: 'football', phase: 'open', settings: { length: 5 },
    players: [{ sessionId: a.sessionId, name: a.pseudo, team: 'red' }], min: 2, max: 2, robots: false, kickoffAt: null, serverNow: NOW
  })
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_coach', venue: 'test_court_a', team: 'red' }, NOW + 1000)
  assert.equal(errors(room, a).at(-1)?.code, 'sports_already_signed')
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'test_coach', venue: 'test_court_a', team: 'blue', settings: { length: 10 } }, NOW + 1000)
  assert.equal(room.sports.lobbies.has('test_court_a'), false)
  const match = room.sports.matches.get('test_court_a') as Match
  assert.deepEqual(match.settings, { length: 5 })
  assert.ok(events.includes('kickoff test_court_a'))
  assert.deepEqual(sentOf(clientOf(room, a), 'sports_lobby_closed'), [{ venue: 'test_court_a', reason: 'kickoff' }])
  assert.equal(bystander.z, COURT.maxZ + 0.5)
  assert.deepEqual(sentOf(clientOf(room, bystander), 'position_correction'), [{ x: -370, y: 1.6, z: COURT.maxZ + 0.5, reason: 'venue_reserved' }])
  assert.deepEqual(room.moves, [bystander.sessionId])
  bystander.lastMoveAt = NOW
  assert.equal(moveRejection(room, bystander, -370, 1.6, COURT.maxZ - 1, NOW + 1000), 'venue_reserved')
  a.lastMoveAt = NOW
  assert.equal(moveRejection(room, a, -370, 1.6, COURT.maxZ - 1, NOW + 1000), null)
  const c = await makePlayer(950, COACH.x, COACH.z + 1)
  c.sportsPassUntil = NOW * 10
  room.players.set(c.sessionId, c)
  room.clients.push((await import('./testWorld.ts')).fakeClient(c.sessionId))
  await venues.onSportsSignup(room, clientOf(room, c), { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 10 } }, NOW + 2000)
  assert.equal(errors(room, c).at(-1)?.code, 'sports_lobby_full')
  await venues.onSportsSignup(room, clientOf(room, c), { coach: 'test_coach', venue: 'test_court_b', team: 'red', settings: { length: 10 } }, NOW + 3000)
  assert.equal(room.sports.lobbies.get('test_court_b')?.coach, 'test_coach')
})

test('the minimum starts a countdown that the tick turns into a kick-off', async () => {
  const { room, players: [a, b] } = await signed(2)
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 10 } }, NOW)
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'test_coach', venue: 'test_court_a', team: 'red' }, NOW)
  assert.equal(room.sports.lobbies.get('test_court_a')?.kickoffAt, NOW + KICKOFF_COUNTDOWN_MS)
  venues.tickSports(room, NOW + KICKOFF_COUNTDOWN_MS - 1)
  assert.equal(room.sports.matches.has('test_court_a'), false)
  venues.tickSports(room, NOW + KICKOFF_COUNTDOWN_MS)
  const match = room.sports.matches.get('test_court_a') as Match
  assert.deepEqual(match.players.map((p) => p.team), ['red', 'blue'])
})

test('a player away past the grace is out and the team at 0 loses', async () => {
  const { room, players: [a, b] } = await signed(2)
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 5 } }, NOW)
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'test_coach', venue: 'test_court_a', team: 'blue' }, NOW)
  const match = room.sports.matches.get('test_court_a') as Match
  b.x = -350
  b.z = -120
  venues.updateMatchesOnMove(room, b, NOW + 1000)
  venues.tickSports(room, NOW + 30_999)
  assert.equal(room.sports.matches.has('test_court_a'), true)
  venues.tickSports(room, NOW + 31_000)
  assert.ok(events.includes(`leave test_court_a ${b.accountId}`))
  assert.equal(room.sports.matches.has('test_court_a'), false)
  assert.deepEqual(ended.find((e) => e.match === match)?.end, { reason: 'forfeit', loser: 'blue' })
  assert.deepEqual(sentOf(clientOf(room, a), 'sports_lobby_closed').at(-1), { venue: 'test_court_a', reason: 'ended' })
  assert.deepEqual((sentOf(clientOf(room, a), 'sports_lobby').at(-1) as { phase: string, players: unknown[] }).players, [])
})

test('a player back in the venue zone within the grace plays on', async () => {
  const { room, players: [a, b] } = await signed(2)
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 5 } }, NOW)
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'test_coach', venue: 'test_court_a', team: 'blue' }, NOW)
  room.players.delete(b.sessionId)
  venues.leaveSports(room, b, NOW + 1000)
  const back = await makePlayer(b.accountId, -370, -170)
  back.sessionId = 'reconnected'
  venues.updateMatchesOnMove(room, back, NOW + 20_000)
  venues.tickSports(room, NOW + 60_000)
  const match = room.sports.matches.get('test_court_a') as Match
  assert.equal(match.players[1].sessionId, 'reconnected')
  assert.equal(match.players[1].out, false)
})

test('a player who disconnects in a match and joins again within the grace is put back where they stood, with their lent gear, and the others are told', async () => {
  const { room, players: [a, b] } = await signed(2)
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 5 } }, NOW)
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'test_coach', venue: 'test_court_a', team: 'blue' }, NOW)
  const match = room.sports.matches.get('test_court_a') as Match
  const stood = { x: b.x, y: b.y, z: b.z, ry: b.ry }
  room.players.delete(b.sessionId)
  venues.leaveSports(room, b, NOW + 1000, [['racket', 'sports_tennis']])
  assert.deepEqual(sentOf(clientOf(room, a), 'sports_absence').at(-1), { venue: 'test_court_a', sessionId: b.sessionId, name: match.players[1].name, state: 'away', graceSec: 30 })
  const back = await makePlayer(b.accountId, 0, 0)
  back.sessionId = 'reconnected'
  room.players.set(back.sessionId, back)
  const client = { sessionId: back.sessionId, sent: [] as { type: string, payload: unknown }[], send(type: string, payload: unknown) { this.sent.push({ type, payload }) } }
  const loans = venues.rejoinMatch(room, client as never, back, NOW + 9000)
  assert.deepEqual(loans, [['racket', 'sports_tennis']])
  assert.deepEqual({ x: back.x, y: back.y, z: back.z, ry: back.ry }, stood)
  assert.deepEqual(client.sent[0], { type: 'teleported', payload: stood })
  assert.equal(match.players[1].sessionId, 'reconnected')
  assert.equal(match.players[1].awaySince, null)
  assert.equal((sentOf(clientOf(room, a), 'sports_absence').at(-1) as { state: string }).state, 'back')
  assert.deepEqual(venues.rejoinMatch(room, client as never, back, NOW + 9500), [])
})

test('a player who joins again after the grace, or after the match, stays where they spawned', async () => {
  const { room, players: [a, b] } = await signed(2)
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 5 } }, NOW)
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'test_coach', venue: 'test_court_a', team: 'blue' }, NOW)
  room.players.delete(b.sessionId)
  venues.leaveSports(room, b, NOW + 1000)
  venues.tickSports(room, NOW + 31_000)
  assert.equal((sentOf(clientOf(room, a), 'sports_absence').at(-1) as { state: string }).state, 'out')
  const back = await makePlayer(b.accountId, 0, 0)
  const client = { sessionId: back.sessionId, send: () => assert.fail('nothing is sent') }
  assert.deepEqual(venues.rejoinMatch(room, client as never, back, NOW + 32_000), [])
  assert.deepEqual([back.x, back.z], [0, 0])
})

test('the first player signed up calls the robots: the empty places of both teams are filled, the match starts at once, and the robots are shown like players', async () => {
  const { room, players: [a, b] } = await signed(2)
  const robotCoach = { coach: 'test_robot_coach', venue: 'test_robot_court' }
  await venues.onSportsSignup(room, clientOf(room, a), { ...robotCoach, team: 'red', settings: { length: 10 } }, NOW)
  await venues.onSportsSignup(room, clientOf(room, b), { ...robotCoach, team: 'red' }, NOW + 2000)
  assert.equal((sentOf(clientOf(room, a), 'sports_lobby').at(-1) as { robots: boolean }).robots, true)
  venues.onSportsRobots(room, clientOf(room, b), { level: 'hard' }, NOW + 4000)
  assert.equal(errors(room, b).at(-1)?.code, 'sports_not_first')
  venues.onSportsRobots(room, clientOf(room, a), { level: 'expert' }, NOW + 4000)
  assert.equal(room.sports.matches.has('test_robot_court'), false)
  venues.onSportsRobots(room, clientOf(room, a), { level: 'hard' }, NOW + 4000)
  const match = room.sports.matches.get('test_robot_court') as Match
  assert.deepEqual([match.robots, match.startedAt], ['hard', NOW + 4000])
  assert.deepEqual(match.players.map((p) => [p.team, p.accountId < 0, p.awaySince]), [['red', false, null], ['red', false, null], ['blue', true, null], ['blue', true, null]])
  const shown = sentOf(clientOf(room, a), 'user_joined') as { sessionId: string, robot: boolean, pseudo: string }[]
  assert.deepEqual(shown.map((u) => [u.sessionId, u.robot, u.pseudo]), [['robot:1', true, 'Robot 1'], ['robot:2', true, 'Robot 2']])
  assert.equal(room.sports.robots.size, 2)
})

test('a robot match ends when its last human leaves, the robots go with it, and the record names humans only', async () => {
  const { room, players: [a] } = await signed(1)
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_robot_coach', venue: 'test_robot_court', team: 'blue', settings: { length: 5 } }, NOW)
  venues.onSportsRobots(room, clientOf(room, a), { level: 'easy' }, NOW + 2000)
  const match = room.sports.matches.get('test_robot_court') as Match
  const robot = match.players.find((p) => p.accountId < 0)!
  api.calls.length = 0
  api.replies.set('POST /sports/matches', () => json({ ok: true }))
  await venues.recordMatch(room, match, [{ accountId: a.accountId, team: 'blue', result: 'win', score: 3 }, { accountId: robot.accountId, team: 'red', result: 'loss', score: 1 }], NOW + 9000)
  assert.deepEqual((api.calls.at(-1)?.body as { players: unknown[] }).players, [{ accountId: a.accountId, team: 'blue', result: 'win', score: 3 }])
  venues.onSportsMatchLeave(room, clientOf(room, a))
  venues.tickSports(room, NOW + 10_000)
  assert.equal(room.sports.matches.has('test_robot_court'), false)
  assert.equal(room.sports.robots.size, 0)
  assert.deepEqual(sentOf(clientOf(room, a), 'user_left').at(-1), { sessionId: robot.sessionId })
  assert.deepEqual(ended.at(-1)?.end, { reason: 'forfeit', loser: null })
})

test('a venue without robots refuses the call', async () => {
  const { room, players: [a] } = await signed(1)
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 5 } }, NOW)
  venues.onSportsRobots(room, clientOf(room, a), { level: 'easy' }, NOW + 2000)
  assert.equal(errors(room, a).at(-1)?.code, 'sports_no_robots')
  assert.equal(room.sports.robots.size, 0)
})

test('leaving the last place in a lobby cancels it, by message or by disconnect', async () => {
  const { room, players: [a, b] } = await signed(2)
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 10 } }, NOW)
  venues.onSportsSignupLeave(room, clientOf(room, a), NOW + 1000)
  assert.equal(room.sports.lobbies.size, 0)
  assert.deepEqual(sentOf(clientOf(room, a), 'sports_lobby_closed'), [{ venue: 'test_court_a', reason: 'cancelled' }])
  assert.deepEqual(clientOf(room, a).sent.at(-1), {
    type: 'sports_lobby',
    payload: { venue: 'test_court_a', coach: 'test_coach', sport: 'football', phase: 'open', settings: null, players: [], min: 2, max: 2, kickoffAt: null, serverNow: NOW + 1000 }
  })
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'test_coach', venue: 'test_court_a', team: 'blue', settings: { length: 10 } }, NOW)
  venues.leaveSports(room, b, NOW + 1000)
  assert.equal(room.sports.lobbies.size, 0)
})

test('a lobby left under the minimum for 5 minutes is cancelled by the tick', async () => {
  const { room, players: [a] } = await signed(1)
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 10 } }, NOW)
  venues.tickSports(room, NOW + 5 * 60_000)
  assert.equal(room.sports.lobbies.size, 0)
  assert.deepEqual(sentOf(clientOf(room, a), 'sports_lobby_closed'), [{ venue: 'test_court_a', reason: 'cancelled' }])
})

test('a venue with gear checks ownership through the API', async () => {
  const { room, players: [a] } = await signed(1)
  api.replies.set('GET /sports/gear', () => json({ gear: ['gear_swimsuit'] }))
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_gear_court', venue: 'test_gear_court', team: 'red', settings: { length: 5 } }, NOW)
  assert.equal(errors(room, a).at(-1)?.code, 'sports_no_gear')
  api.replies.set('GET /sports/gear', () => json({ gear: ['gear_boxing_gloves'] }))
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_gear_court', venue: 'test_gear_court', team: 'red', settings: { length: 5 } }, NOW + 1000)
  assert.equal(room.sports.lobbies.get('test_gear_court')?.entrants.length, 1)
  assert.equal(a.sportsPending, false)
})

test('a match is recorded once per match id with the socket results', async () => {
  const { room, players: [a, b] } = await signed(2)
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_coach', venue: 'test_court_a', team: 'red', settings: { length: 5 } }, NOW)
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'test_coach', venue: 'test_court_a', team: 'blue' }, NOW)
  const match = room.sports.matches.get('test_court_a') as Match
  api.calls.length = 0
  api.replies.set('POST /sports/matches', () => json({ ok: true }))
  await venues.recordMatch(room, match, [
    { accountId: a.accountId, team: 'red', result: 'win', score: 3 },
    { accountId: b.accountId, team: 'blue', result: 'loss', score: 1 }
  ], NOW + 300_000)
  assert.deepEqual(api.calls, [{
    url: '/sports/matches',
    method: 'POST',
    body: {
      ref: match.id,
      sport: 'football',
      venue: 'test_court_a',
      settings: { length: 5 },
      startedAt: NOW,
      endedAt: NOW + 300_000,
      players: [
        { accountId: a.accountId, team: 'red', result: 'win', score: 3 },
        { accountId: b.accountId, team: 'blue', result: 'loss', score: 1 }
      ]
    }
  }])
  await assert.rejects(venues.recordMatch(room, match, [{ accountId: 42, team: null, result: 'win' }]), /invalid result/)
  await assert.rejects(venues.recordMatch(room, match, [{ accountId: a.accountId, team: 'red', result: 'win', place: -1 }]), /invalid result/)
})

test('a venue sharing its play area refuses a sign-up while the other one is in use', async () => {
  const { room, players: [a, b] } = await signed(2)
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_gym_coach', venue: 'test_gym_football', team: 'red', settings: { length: 10 } }, NOW)
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'test_gym_coach', venue: 'test_gym_basketball', team: 'red', settings: { length: 10 } }, NOW)
  assert.equal(errors(room, b).at(-1)?.code, 'sports_venue_busy')
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'test_gym_coach', venue: 'test_gym_football', team: 'blue' }, NOW + 1000)
  assert.equal(room.sports.lobbies.get('test_gym_football')?.entrants.length, 2)
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'test_gym_coach', venue: 'test_court_a', team: 'blue', settings: { length: 10 } }, NOW + 2000)
  assert.equal(room.sports.lobbies.has('test_court_a'), false)
})

test('a confined venue keeps its match players inside the play area until they leave the match', async () => {
  const { room, players: [a, b] } = await signed(2)
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'test_confined_coach', venue: 'test_confined', team: 'red', settings: { length: 5 } }, NOW)
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'test_confined_coach', venue: 'test_confined', team: 'blue' }, NOW + 1000)
  assert.ok(room.sports.matches.has('test_confined'))
  Object.assign(a, { x: -378, z: -184, lastMoveAt: NOW })
  assert.equal(moveRejection(room, a, -376.8, 1.6, -184, NOW + 1000), 'match_bounds')
  assert.equal(moveRejection(room, a, -377.2, 1.6, -184, NOW + 1000), null)
  Object.assign(b, { x: -376, z: -184, lastMoveAt: NOW })
  assert.equal(moveRejection(room, b, -375.5, 1.6, -184, NOW + 1000), null)
  assert.equal(moveRejection(room, b, -377.5, 1.6, -184, NOW + 1000), null)
  venues.onSportsMatchLeave(room, clientOf(room, a))
  assert.ok(events.includes(`leave test_confined ${a.accountId}`))
  assert.equal(moveRejection(room, a, -376.8, 1.6, -184, NOW + 1000), null)
  venues.onSportsMatchLeave(room, clientOf(room, a))
  assert.equal(events.filter((e) => e === `leave test_confined ${a.accountId}`).length, 1)
  venues.tickSports(room, NOW + 2000)
  assert.equal(room.sports.matches.has('test_confined'), false)
  assert.deepEqual(ended.at(-1)?.end, { reason: 'forfeit', loser: 'red' })
})

test('registrations are checked', () => {
  assert.throws(() => fakeVenue('test_court_a'), /duplicate/)
  assert.throws(() => fakeVenue('Bad Id'), /invalid/)
  assert.throws(() => fakeVenue('test_bad_area', { playArea: { minX: 1, maxX: 0, minZ: 0, maxZ: 1 } }), /play area/)
  assert.throws(() => venues.registerCoach({ id: 'test_ghost', x: 0, z: 0, venues: ['nowhere'] }), /unknown venue/)
  venues.assertVenueZones()
  fakeVenue('test_off_site', { zone: 'sports_road' })
  assert.throws(() => venues.assertVenueZones(), /not a sports pass area/)
})
