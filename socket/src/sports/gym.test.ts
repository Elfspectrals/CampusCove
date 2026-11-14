import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { api, clientOf, fakeRoom, installWorld, json, makePlayer, sentOf } from './testWorld.ts'

installWorld()
const { loadWorld } = await import('../world.ts')
const { registerGymVenue, gymAreaBusy, onGymAction, onGymBall, onGymBallReturn, tickGym } = await import('./gym.ts')
const { addGymFreeCourt } = await import('./gymFree.ts')
const { parseFootballRules } = await import('./gymRules.ts')
const { moveRejection } = await import('../movement.ts')
const { parseGymCourt } = await import('./gymCourt.ts')
const { parseBasketballRules } = await import('./gymRules.ts')
const { onSportsSignup, tickSports } = await import('./venues.ts')
await loadWorld()

const raw = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/basketball.json', import.meta.url), 'utf8'))
const court = parseGymCourt({
  walls: true,
  floorY: 0.2,
  ceilingY: 9,
  arena: { minX: -379, maxX: -361, minZ: -178, maxZ: -162 },
  playArea: { minX: -378.5, maxX: -361.5, minZ: -177, maxZ: -163 },
  court: { minX: -378, maxX: -362, minZ: -177, maxZ: -163 },
  centre: { x: -370, z: -170 },
  coach: { x: -370, z: -177.5 },
  goals: { red: { lineX: -362, inward: 1, minZ: -171.5, maxZ: -168.5, height: 2, depth: 1 }, blue: { lineX: -378, inward: -1, minZ: -171.5, maxZ: -168.5, height: 2, depth: 1 } },
  baskets: {
    red: { x: -363.5, y: 3.25, z: -170, rimRadius: 0.225, board: { minX: -363.125, maxX: -363.075, minY: 3.1, maxY: 4.15, minZ: -170.9, maxZ: -169.1 }, threePointRadius: 6.75 },
    blue: { x: -376.5, y: 3.25, z: -170, rimRadius: 0.225, board: { minX: -376.925, maxX: -376.875, minY: 3.1, maxY: 4.15, minZ: -170.9, maxZ: -169.1 }, threePointRadius: 6.75 }
  },
  sideBaskets: []
})
registerGymVenue({ id: 'gym_test_basketball', zone: 'sports_gym', playAreaId: 'gym_test_court', court, rules: parseBasketballRules(raw), settings: raw.signup.settings, minPlayers: 2, rejoinGraceMs: 30_000 })
const footballRaw = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/football.json', import.meta.url), 'utf8'))
addGymFreeCourt({ id: 'gym_test', court, rules: { football: parseFootballRules(footballRaw), basketball: parseBasketballRules(raw) }, zone: 'sports_gym', busy: (room) => gymAreaBusy(room, 'gym_test_court') })

const NOW = 9_000_000
const SETTINGS = { teamSize: 1, durationSec: 240 }

async function kickedOff() {
  const red = await makePlayer(201, -370, -176)
  const blue = await makePlayer(202, -370.5, -176)
  for (const p of [red, blue]) p.sportsPassUntil = NOW * 10
  const room = await fakeRoom([red, blue])
  await onSportsSignup(room, clientOf(room, red), { coach: 'gym_test_basketball', venue: 'gym_test_basketball', team: 'red', settings: SETTINGS }, NOW)
  await onSportsSignup(room, clientOf(room, blue), { coach: 'gym_test_basketball', venue: 'gym_test_basketball', team: 'blue' }, NOW)
  tickSports(room, NOW)
  return { room, red, blue }
}

test('a full gym lobby kicks off and the players get the ball state', async () => {
  const { room, red } = await kickedOff()
  assert.ok(room.sports.matches.has('gym_test_basketball'))
  const state = sentOf(clientOf(room, red), 'gym_state').at(-1) as { sport: string, score: unknown, endsAt: number, owner: unknown }
  assert.equal(state.sport, 'basketball')
  assert.deepEqual(state.score, { red: 0, blue: 0 })
  assert.equal(state.endsAt, NOW + 240_000)
  assert.equal(state.owner, null)
})

test('the carrier passes through gym_action and everyone in the match sees it; a stranger cannot act', async () => {
  const { room, red, blue } = await kickedOff()
  red.x = -370.3
  red.z = -170
  red.ry = -Math.PI / 2
  tickSports(room, NOW + 3100)
  const owner = (sentOf(clientOf(room, red), 'gym_state').at(-1) as { owner: string }).owner
  assert.equal(owner, red.sessionId)
  onGymAction(room, clientOf(room, blue), { kind: 'pass' }, NOW + 3200)
  assert.equal(sentOf(clientOf(room, blue), 'gym_event').length, 0)
  onGymAction(room, clientOf(room, red), { kind: 'pass' }, NOW + 3300)
  onGymAction(room, clientOf(room, red), { kind: 'cheat' }, NOW + 3400)
  assert.deepEqual(sentOf(clientOf(room, blue), 'gym_event'), [{ venue: 'gym_test_basketball', kind: 'kick', shot: false, sessionId: red.sessionId }])
})

test('the clock ends the match, the result goes to Laravel once with the score of each player', async () => {
  api.calls.length = 0
  api.replies.set('POST /sports/matches', () => json({ match: { id: 1, recorded: true } }))
  api.replies.set('POST /sports/gym/tasks', () => json({ counted: [201, 202] }))
  const { room, red } = await kickedOff()
  tickSports(room, NOW + 240_000)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(room.sports.matches.has('gym_test_basketball'), false)
  assert.deepEqual(sentOf(clientOf(room, red), 'gym_end'), [{ venue: 'gym_test_basketball', sport: 'basketball', score: { red: 0, blue: 0 }, winner: null, reason: 'finished' }])
  await new Promise((resolve) => setImmediate(resolve))
  const records = api.calls.filter((c) => c.url === '/sports/matches')
  assert.equal(records.length, 1)
  assert.deepEqual(api.calls.filter((c) => c.url === '/sports/gym/tasks').map((c) => c.body), [{
    ref: (records[0].body as { ref: string }).ref,
    sport: 'basketball',
    players: [{ accountId: 201, threes: 0 }, { accountId: 202, threes: 0 }]
  }])
  const body = records[0].body as { sport: string, players: unknown[] }
  assert.equal(body.sport, 'basketball')
  assert.deepEqual(body.players, [
    { accountId: 201, team: 'red', result: 'draw', score: 0 },
    { accountId: 202, team: 'blue', result: 'draw', score: 0 }
  ])
})

type FreeState = { balls: { id: string, sport: string, ball: number[], owner: string | null }[] }

test('free play: the coach lends a ball near him, a kick moves it, giving it back removes it', async () => {
  const p = await makePlayer(301, -370, -176)
  p.sportsPassUntil = NOW * 10
  const far = await makePlayer(302, -365, -170)
  const room = await fakeRoom([p, far])
  onGymBall(room, clientOf(room, far), { sport: 'football' }, NOW)
  assert.equal((sentOf(clientOf(room, far), 'gym_error').at(-1) as { code: string }).code, 'gym_too_far')
  onGymBall(room, clientOf(room, p), { sport: 'football' }, NOW)
  assert.ok(p.sportsLoans.has('gym_ball'))
  const lent = sentOf(clientOf(room, p), 'gym_free').at(-1) as FreeState
  assert.equal(lent.balls.length, 1)
  const [bx, , bz] = lent.balls[0].ball
  p.x = bx + 0.3
  p.z = bz
  p.ry = -Math.PI / 2
  tickGym(room, NOW + 100)
  tickGym(room, NOW + 200)
  assert.equal((sentOf(clientOf(room, p), 'gym_free').at(-1) as FreeState).balls[0].owner, p.sessionId)
  onGymAction(room, clientOf(room, p), { kind: 'pass' }, NOW + 300)
  assert.equal((sentOf(clientOf(room, p), 'gym_event').at(-1) as { kind: string }).kind, 'kick')
  tickGym(room, NOW + 400)
  const moving = (sentOf(clientOf(room, p), 'gym_free').at(-1) as FreeState).balls[0]
  assert.equal(moving.owner, null)
  assert.ok(moving.ball[3] > 0)
  onGymBallReturn(room, clientOf(room, p), NOW + 500)
  assert.equal(p.sportsLoans.has('gym_ball'), false)
  assert.deepEqual((sentOf(clientOf(room, p), 'gym_free').at(-1) as FreeState).balls, [])
})

test('free play: a ball whose loan was taken back disappears, and a match takes every free ball back', async () => {
  const p = await makePlayer(311, -370, -176)
  const room = await fakeRoom([p])
  onGymBall(room, clientOf(room, p), { sport: 'basketball' }, NOW)
  p.sportsLoans.clear()
  tickGym(room, NOW + 100)
  assert.deepEqual((sentOf(clientOf(room, p), 'gym_free').at(-1) as FreeState).balls, [])
  const { room: busy, red } = await kickedOff()
  onGymBall(busy, clientOf(busy, red), { sport: 'football' }, NOW + 10)
  assert.equal((sentOf(clientOf(busy, red), 'gym_error').at(-1) as { code: string }).code, 'gym_court_busy')
})

test('a missed tackle puts the player down: the socket refuses his moves for the ground time', async () => {
  const p = await makePlayer(321, -370, -176)
  const room = await fakeRoom([p])
  onGymBall(room, clientOf(room, p), { sport: 'football' }, NOW)
  p.x = -370
  p.z = -174.9
  p.ry = Math.PI
  tickGym(room, NOW + 100)
  onGymAction(room, clientOf(room, p), { kind: 'tackle' }, NOW + 200)
  assert.equal((sentOf(clientOf(room, p), 'gym_event').at(-1) as { kind: string, won: boolean }).won, false)
  assert.equal(moveRejection(room, p, p.x + 0.1, p.y, p.z, NOW + 500), 'tackled')
  p.lastMoveAt = NOW + 1000
  assert.equal(moveRejection(room, p, p.x + 0.1, p.y, p.z, NOW + 1100), null)
})
