import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { api, clientOf, fakeRoom, installWorld, json, makePlayer, sentOf } from './testWorld.ts'

installWorld()
const { loadWorld } = await import('../world.ts')
const { registerGymVenue, onGymAction } = await import('./gym.ts')
const { parseGymCourt } = await import('./gymCourt.ts')
const { parseBasketballRules } = await import('./gymRules.ts')
const { onSportsSignup, tickSports } = await import('./venues.ts')
await loadWorld()

const raw = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/basketball.json', import.meta.url), 'utf8'))
const court = parseGymCourt({
  floorY: 0.2,
  ceilingY: 9,
  arena: { minX: -379, maxX: -361, minZ: -178, maxZ: -162 },
  playArea: { minX: -378.5, maxX: -361.5, minZ: -177, maxZ: -163 },
  court: { minX: -378, maxX: -362, minZ: -177, maxZ: -163 },
  centre: { x: -370, z: -170 },
  coach: { x: -370, z: -177.5 },
  goals: { red: { lineX: -362, inward: 1, minZ: -171.5, maxZ: -168.5, height: 2 }, blue: { lineX: -378, inward: -1, minZ: -171.5, maxZ: -168.5, height: 2 } },
  baskets: {
    red: { x: -363.5, y: 3.25, z: -170, rimRadius: 0.225, boardX: -363.1, boardHalfWidth: 0.9, boardBottom: 3.1, boardTop: 4.15, threePointRadius: 6.75 },
    blue: { x: -376.5, y: 3.25, z: -170, rimRadius: 0.225, boardX: -376.9, boardHalfWidth: 0.9, boardBottom: 3.1, boardTop: 4.15, threePointRadius: 6.75 }
  }
})
registerGymVenue({ id: 'gym_test_basketball', court, rules: parseBasketballRules(raw), settings: raw.signup.settings, minPlayers: 2, rejoinGraceMs: 30_000 })

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
  const { room, red } = await kickedOff()
  tickSports(room, NOW + 240_000)
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(room.sports.matches.has('gym_test_basketball'), false)
  assert.deepEqual(sentOf(clientOf(room, red), 'gym_end'), [{ venue: 'gym_test_basketball', sport: 'basketball', score: { red: 0, blue: 0 }, winner: null, reason: 'finished' }])
  const records = api.calls.filter((c) => c.url === '/sports/matches')
  assert.equal(records.length, 1)
  const body = records[0].body as { sport: string, players: unknown[] }
  assert.equal(body.sport, 'basketball')
  assert.deepEqual(body.players, [
    { accountId: 201, team: 'red', result: 'draw', score: 0 },
    { accountId: 202, team: 'blue', result: 'draw', score: 0 }
  ])
})
