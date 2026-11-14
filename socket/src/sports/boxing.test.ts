import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Player } from '../types.ts'
import { boxingRulesJson } from './boxingTestRules.ts'
import { type FakeRoom, api, clientOf, fakeRoom, installWorld, json, makePlayer, manifest, sentOf } from './testWorld.ts'

installWorld()
manifest.zones.push({ key: 'sports_boxing', sportsPass: true, bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 } })
api.files.set('sports/rules/boxing.json', boxingRulesJson())
api.replies.set('GET /sports/gear', () => json({ gear: ['gear_boxing_gloves'] }))
api.replies.set('POST /sports/matches', () => json({ match: { id: 1, recorded: true } }))
const { loadWorld } = await import('../world.ts')
await loadWorld()
const boxing = await import('./boxing.ts')
const venues = await import('./venues.ts')
const rules = await boxing.registerBoxing()

const NOW = 9_000_000
const ROUND_START = NOW + rules.introSec * 1000
const FACING_EAST = -Math.PI / 2

async function bout(): Promise<{ room: FakeRoom, red: Player, blue: Player, matchId: string }> {
  const [red, blue] = await Promise.all([makePlayer(301, rules.coach.x, rules.coach.z + 1), makePlayer(302, rules.coach.x + 1, rules.coach.z)])
  for (const p of [red, blue]) p.sportsPassUntil = NOW * 10
  const room = await fakeRoom([red, blue])
  await venues.onSportsSignup(room, clientOf(room, red), { coach: rules.coachId, venue: boxing.BOXING_VENUE, settings: { rounds: 1 } }, NOW)
  await venues.onSportsSignup(room, clientOf(room, blue), { coach: rules.coachId, venue: boxing.BOXING_VENUE }, NOW)
  const match = room.sports.matches.get(boxing.BOXING_VENUE)
  assert.ok(match, 'two boxers kick off at once')
  return { room, red, blue, matchId: match.id }
}

function faceOff(red: Player, blue: Player): void {
  Object.assign(red, { x: 0, z: 0, y: 2.7, ry: FACING_EAST })
  Object.assign(blue, { x: 1, z: 0, y: 2.7, ry: Math.PI / 2 })
}

function lastState(room: FakeRoom, player: Player) {
  return sentOf(clientOf(room, player), 'boxing_state').at(-1) as ReturnType<typeof boxing.boutView>
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

test('two signed-up boxers are put in their corners and the bout opens with the intro', async () => {
  const { room, red, blue } = await bout()
  assert.deepEqual([red.x, red.y, red.z], [rules.corners.red.x, rules.corners.red.y + 1.6, rules.corners.red.z])
  assert.deepEqual([blue.x, blue.z], [rules.corners.blue.x, rules.corners.blue.z])
  assert.equal(sentOf(clientOf(room, red), 'teleported').length, 1)
  const state = lastState(room, blue)
  assert.deepEqual([state.phase, state.rounds, state.boxers.map((b) => b.corner)], ['intro', 1, ['red', 'blue']])
})

test('a jab within reach and facing lands on the server positions; a punch from a spectator or of an unknown kind is ignored', async () => {
  const { room, red, blue } = await bout()
  venues.tickSports(room, ROUND_START)
  faceOff(red, blue)
  boxing.onBoxingPunch(room, clientOf(room, red), { kind: 'uppercut' }, ROUND_START)
  boxing.onBoxingPunch(room, clientOf(room, red), { kind: 'jab' }, ROUND_START)
  const hits = sentOf(clientOf(room, blue), 'boxing_hit') as { outcome: string, kind: string }[]
  assert.deepEqual(hits, [{ sessionId: red.sessionId, targetSessionId: blue.sessionId, kind: 'jab', outcome: 'landed', damage: rules.punches.jab.damage }])
  assert.equal(lastState(room, blue).boxers[1].health, rules.health - rules.punches.jab.damage)
  blue.ry = FACING_EAST
  boxing.onBoxingPunch(room, clientOf(room, blue), { kind: 'jab' }, ROUND_START + 10)
  assert.equal((sentOf(clientOf(room, red), 'boxing_hit').at(-1) as { outcome: string }).outcome, 'missed')
})

test('a knockout ends the bout, sends the boxers out of the ring and records a win and a loss', async () => {
  const { room, red, blue, matchId } = await bout()
  venues.tickSports(room, ROUND_START)
  faceOff(red, blue)
  const fight = boxing.boxingFight(matchId)
  assert.ok(fight)
  fight.bout.boxers[1].knockdowns = rules.knockdown.maxPerFight - 1
  fight.bout.boxers[1].health = 1
  api.calls.length = 0
  boxing.onBoxingPunch(room, clientOf(room, red), { kind: 'jab' }, ROUND_START)
  venues.tickSports(room, ROUND_START + 100)
  await settle()
  assert.equal(room.sports.matches.has(boxing.BOXING_VENUE), false)
  const record = api.calls.find((c) => c.url === '/sports/matches')?.body as { players: unknown[], sport: string, settings: unknown }
  assert.deepEqual(record.players, [
    { accountId: 301, team: null, result: 'win', score: 1 },
    { accountId: 302, team: null, result: 'loss', score: 0 }
  ])
  assert.deepEqual([record.sport, record.settings], ['boxing', { rounds: 1 }])
  assert.deepEqual([blue.x, blue.z], [rules.exits.blue.x, rules.exits.blue.z])
  assert.deepEqual(lastState(room, red).result, { winner: red.sessionId, method: 'ko' })
})

test('a boxer who leaves the ring after the intro loses by forfeit', async () => {
  const { room, red, blue } = await bout()
  venues.tickSports(room, ROUND_START)
  faceOff(red, blue)
  blue.x = rules.ringCentre.x + rules.ringHalfM + 1
  api.calls.length = 0
  venues.tickSports(room, ROUND_START + 100)
  await settle()
  const record = api.calls.find((c) => c.url === '/sports/matches')?.body as { players: { result: string }[] }
  assert.deepEqual(record.players.map((p) => p.result), ['win', 'loss'])
  assert.deepEqual(lastState(room, red).result, { winner: red.sessionId, method: 'forfeit' })
})

test('guard, dodge and get-up presses only count for a boxer of the running bout', async () => {
  const { room, red, blue, matchId } = await bout()
  venues.tickSports(room, ROUND_START)
  faceOff(red, blue)
  boxing.onBoxingGuard(room, clientOf(room, blue), { up: 'yes' })
  assert.equal(boxing.boxingFight(matchId)?.bout.boxers[1].guard, false)
  boxing.onBoxingGuard(room, clientOf(room, blue), { up: true })
  assert.equal(boxing.boxingFight(matchId)?.bout.boxers[1].guard, true)
  boxing.onBoxingDodge(room, clientOf(room, red), { side: 'up' }, ROUND_START)
  boxing.onBoxingDodge(room, clientOf(room, red), { side: 'left' }, ROUND_START)
  assert.deepEqual(sentOf(clientOf(room, blue), 'boxing_dodged'), [{ sessionId: red.sessionId, side: 'left' }])
})

test('the street punch never lands between the two boxers of a bout', async () => {
  const { onPunch } = await import('../punch.ts')
  const { room, red, blue } = await bout()
  venues.tickSports(room, ROUND_START)
  faceOff(red, blue)
  for (const p of [red, blue]) p.stats = { health: 100, hunger: 100, thirst: 100 }
  red.lastPunchAt = 0
  onPunch(room, clientOf(room, red), { targetSessionId: blue.sessionId })
  const sent = sentOf(clientOf(room, blue), 'user_punched').at(-1) as { targetSessionId: string | null }
  assert.equal(sent.targetSessionId, null)
  assert.equal(blue.stats?.health, 100)
})

test('a boxer on the canvas cannot walk away until they get up', async () => {
  const { moveRejection } = await import('../movement.ts')
  const { room, red, blue, matchId } = await bout()
  venues.tickSports(room, ROUND_START)
  faceOff(red, blue)
  const fight = boxing.boxingFight(matchId)
  assert.ok(fight)
  fight.bout.boxers[1].health = 1
  boxing.onBoxingPunch(room, clientOf(room, red), { kind: 'jab' }, ROUND_START)
  blue.lastMoveAt = ROUND_START
  assert.equal(moveRejection(room, blue, blue.x + 2, blue.y, blue.z, ROUND_START + 1000), 'boxing_down')
  assert.equal(moveRejection(room, red, red.x - 2, red.y, red.z, ROUND_START + 1000), null)
})

test('a punch bag answers a gloved player in reach and facing it, at most every 400 ms', async () => {
  const [player] = await Promise.all([makePlayer(401, 6, 1)])
  const room = await fakeRoom([player])
  Object.assign(player, { x: 6, z: 1, ry: 0 })
  await boxing.onBoxingBag(room, clientOf(room, player), { bag: 0, kind: 'jab' }, NOW)
  await boxing.onBoxingBag(room, clientOf(room, player), { bag: 0, kind: 'jab' }, NOW + 399)
  await boxing.onBoxingBag(room, clientOf(room, player), { bag: 1, kind: 'jab' }, NOW + 400)
  await boxing.onBoxingBag(room, clientOf(room, player), { bag: 7, kind: 'jab' }, NOW + 800)
  await boxing.onBoxingBag(room, clientOf(room, player), { bag: 0, kind: 'uppercut' }, NOW + 1200)
  assert.deepEqual(sentOf(clientOf(room, player), 'boxing_bag_hit'), [{ bag: 0, sessionId: player.sessionId, kind: 'jab' }])
  player.ry = Math.PI
  await boxing.onBoxingBag(room, clientOf(room, player), { bag: 0, kind: 'cross' }, NOW + 2000)
  assert.equal(sentOf(clientOf(room, player), 'boxing_bag_hit').length, 1)
})

test('a player without gloves is told so and the bag does not move', async () => {
  const [player] = await Promise.all([makePlayer(402, 6, 1)])
  const room = await fakeRoom([player])
  Object.assign(player, { x: 6, z: 1, ry: 0 })
  api.replies.set('GET /sports/gear', () => json({ gear: [] }))
  await boxing.onBoxingBag(room, clientOf(room, player), { bag: 0, kind: 'hook' }, NOW)
  api.replies.set('GET /sports/gear', () => json({ gear: ['gear_boxing_gloves'] }))
  assert.deepEqual(sentOf(clientOf(room, player), 'boxing_no_gloves'), [{ reason: 'missing' }])
  assert.equal(sentOf(clientOf(room, player), 'boxing_bag_hit').length, 0)
})
