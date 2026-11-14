import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Player } from '../types.ts'
import { type FakeRoom, api, clientOf, fakeRoom, installWorld, json, makePlayer, manifest, sentOf } from './testWorld.ts'

const RULES = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/petanque.json', import.meta.url), 'utf8'))
manifest.zones.push({ key: 'sports_petanque', sportsPass: true, bounds: { minX: -414, maxX: -386, minZ: -275, maxZ: -250 } })
api.files.set('sports/rules/petanque.json', RULES)
api.replies.set('GET /sports/gear', () => json({ gear: ['gear_boules'] }))
api.replies.set('POST /sports/matches', () => json({ match: { id: 1, recorded: true } }))
installWorld()
const { loadWorld } = await import('../world.ts')
await loadWorld()
const venues = await import('./venues.ts')
const petanque = await import('./petanque.ts')
await petanque.loadPetanque()
const { parsePetanqueRules } = await import('./petanqueRules.ts')

const rules = parsePetanqueRules(RULES)
const NOW = 9_000_000
const still = () => 0.25

interface StateView {
  venue: string
  phase: 'jack' | 'boules' | 'between'
  thrower: string | null
  busyUntil: number
  turnEndsAt: number
  end: number
  circle: { x: number, z: number, axisZ: number }
  score: { red: number, blue: number }
  players: { sessionId: string, left: number, team: string }[]
  balls: { kind: string, dead: boolean }[]
  lastEnd: { team: string | null, points: number } | null
  point: { team: string } | null
}

async function startGame(): Promise<{ room: FakeRoom, players: Player[] }> {
  const players = await Promise.all([201, 202].map((id) => makePlayer(id, rules.coach.x, rules.coach.z - 1)))
  for (const p of players) p.sportsPassUntil = NOW * 10
  const room = await fakeRoom(players)
  await venues.onSportsSignup(room, clientOf(room, players[0]), { coach: 'petanque_coach', venue: 'petanque_1', team: 'red', settings: { format: '1v1_3', targetPoints: 7 } }, NOW)
  await venues.onSportsSignup(room, clientOf(room, players[1]), { coach: 'petanque_coach', venue: 'petanque_1', team: 'blue' }, NOW + 1_000)
  return { room, players }
}

function lastState(room: FakeRoom, player: Player): StateView {
  return sentOf(clientOf(room, player), 'petanque_state').at(-1) as StateView
}

function throwTurn(room: FakeRoom, players: Player[], at: number, payload = { yaw: 0, mode: 'point' }): number {
  const state = lastState(room, players[0])
  const thrower = players.find((p) => p.sessionId === state.thrower) as Player
  thrower.x = state.circle.x
  thrower.z = state.circle.z
  const start = Math.max(at, state.busyUntil)
  petanque.onPetanqueAim(room, clientOf(room, thrower), start)
  petanque.onPetanqueThrow(room, clientOf(room, thrower), payload, start + 700, still)
  return start + 700
}

test('a full 1 v 1 kicks off on the first piste with the jack to throw from the south circle', async () => {
  const { room, players } = await startGame()
  assert.ok(room.sports.matches.has('petanque_1'))
  const state = lastState(room, players[0])
  assert.equal(state.phase, 'jack')
  assert.equal(state.end, 1)
  assert.equal(state.circle.axisZ, -1)
  assert.ok(Math.abs(state.circle.z - (rules.pistes[0].bounds.maxZ - 1)) < 1e-9)
  assert.deepEqual(state.players.map((p) => p.left), [3, 3])
  assert.ok(players.some((p) => p.sessionId === state.thrower))
})

test('only the thrower, standing in the circle, may throw', async () => {
  const { room, players } = await startGame()
  const state = lastState(room, players[0])
  const thrower = players.find((p) => p.sessionId === state.thrower) as Player
  const waiting = players.find((p) => p !== thrower) as Player
  petanque.onPetanqueAim(room, clientOf(room, waiting), NOW + 2_000)
  assert.equal((sentOf(clientOf(room, waiting), 'sports_error').at(-1) as { code: string }).code, 'petanque_not_your_turn')
  petanque.onPetanqueAim(room, clientOf(room, thrower), NOW + 2_000)
  assert.equal((sentOf(clientOf(room, thrower), 'sports_error').at(-1) as { code: string }).code, 'petanque_not_in_circle')
  petanque.onPetanqueThrow(room, clientOf(room, thrower), { yaw: 0, mode: 'point' }, NOW + 2_500)
  assert.equal(sentOf(clientOf(room, thrower), 'petanque_throw').length, 0)
})

test('the power comes from the server clock between aim and release', async () => {
  const { room, players } = await startGame()
  const state = lastState(room, players[0])
  const thrower = players.find((p) => p.sessionId === state.thrower) as Player
  thrower.x = state.circle.x
  thrower.z = state.circle.z
  petanque.onPetanqueAim(room, clientOf(room, thrower), NOW + 2_000)
  petanque.onPetanqueThrow(room, clientOf(room, thrower), { yaw: 0, mode: 'point', power: 1 }, NOW + 2_000 + 0.65 * rules.riseMs, still)
  const thrown = sentOf(clientOf(room, players[0]), 'petanque_throw').at(-1) as { kind: string, landing: { z: number } }
  assert.equal(thrown.kind, 'jack')
  const expected = state.circle.z - 0.65 * rules.throw.maxDistanceM * rules.throw.pointLandFraction
  assert.ok(Math.abs(thrown.landing.z - expected) < 0.01, `landed at ${thrown.landing.z}`)
  const after = lastState(room, players[0])
  assert.equal(after.phase, 'boules')
  assert.equal(after.balls.length, 1)
})

test('boules alternate until all are thrown, then the end is scored and the next one starts from the north circle', async () => {
  const { room, players } = await startGame()
  let at = throwTurn(room, players, NOW + 2_000, { yaw: 0, mode: 'point' })
  for (let i = 0; i < 6; i++) at = throwTurn(room, players, at, { yaw: (i % 3 - 1) * 0.02, mode: 'point' })
  const scored = lastState(room, players[0])
  assert.equal(scored.phase, 'between')
  assert.ok(scored.lastEnd && scored.lastEnd.points >= 1)
  assert.equal(scored.score[scored.lastEnd.team as 'red' | 'blue'], scored.lastEnd.points)
  assert.deepEqual(scored.players.map((p) => p.left), [0, 0])
  const match = room.sports.matches.get('petanque_1')
  assert.ok(match)
  venues.tickSports(room, scored.busyUntil + 1)
  const next = lastState(room, players[0])
  assert.equal(next.end, 2)
  assert.equal(next.phase, 'jack')
  assert.equal(next.circle.axisZ, 1)
  assert.equal(players.find((p) => p.sessionId === next.thrower)?.sessionId !== undefined, true)
})

test('a thrower who lets the shot clock run out loses that boule; an unthrown jack is placed', async () => {
  const { room, players } = await startGame()
  const first = lastState(room, players[0])
  venues.tickSports(room, first.turnEndsAt + 1)
  const placed = lastState(room, players[0])
  assert.equal(placed.phase, 'boules')
  assert.equal(placed.balls.length, 1)
  venues.tickSports(room, placed.turnEndsAt + 1)
  const after = lastState(room, players[0])
  assert.equal(after.players.reduce((sum, p) => sum + p.left, 0), 5)
})

test('a player gone past the grace forfeits and the match is recorded with a winner and a loser', async () => {
  const { room, players } = await startGame()
  api.calls.length = 0
  venues.leaveSports(room, players[1], NOW + 2_000)
  venues.tickSports(room, NOW + 2_000 + rules.rejoinGraceMs + 1)
  assert.equal(room.sports.matches.has('petanque_1'), false)
  assert.ok(sentOf(clientOf(room, players[0]), 'petanque_closed').length === 1)
  await new Promise((resolve) => setImmediate(resolve))
  const call = api.calls.find((c) => c.url === '/sports/matches')
  assert.ok(call)
  const body = call.body as { sport: string, players: { accountId: number, result: string }[] }
  assert.equal(body.sport, 'petanque')
  assert.deepEqual(body.players.map((p) => [p.accountId, p.result]), [[201, 'win'], [202, 'loss']])
})

test('the sign-up needs a full team on each side and the player\'s own boules', async () => {
  const lonely = await makePlayer(301, rules.coach.x, rules.coach.z - 1)
  lonely.sportsPassUntil = NOW * 10
  const room = await fakeRoom([lonely])
  api.replies.set('GET /sports/gear', () => json({ gear: [] }))
  await venues.onSportsSignup(room, clientOf(room, lonely), { coach: 'petanque_coach', venue: 'petanque_2', team: 'red', settings: { format: '2v2_3', targetPoints: 13 } }, NOW)
  assert.equal((sentOf(clientOf(room, lonely), 'sports_error').at(-1) as { code: string }).code, 'sports_no_gear')
  api.replies.set('GET /sports/gear', () => json({ gear: ['gear_boules'] }))
  await venues.onSportsSignup(room, clientOf(room, lonely), { coach: 'petanque_coach', venue: 'petanque_2', team: 'red', settings: { format: '2v2_3', targetPoints: 13 } }, NOW + 1_000)
  const lobby = room.sports.lobbies.get('petanque_2')
  assert.deepEqual(lobby && [lobby.range.min, lobby.range.max], [4, 4])
})
