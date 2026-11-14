import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Player } from '../types.ts'
import type { SkatingRules } from './skatingSim.ts'
import { type FakeRoom, api, clientOf, fakeRoom, installWorld, json, makePlayer, manifest, sentOf } from './testWorld.ts'

const RINK = { minX: -350, maxX: -310, minZ: -135, maxZ: -115 }
const ZONE = { minX: -360, maxX: -305, minZ: -140, maxZ: -105 }
const COACH = { id: 'test_rink_coach', x: -345, z: -110 }
;(manifest.zones as object[]).push({ key: 'test_rink', sportsPass: true, bounds: ZONE })
installWorld()
const { loadWorld } = await import('../world.ts')
const { moveRejection } = await import('../movement.ts')
const venues = await import('./venues.ts')
const rink = await import('./skatingRink.ts')
const { parseSkatingRules } = await import('./skatingSim.ts')
const { KICKOFF_COUNTDOWN_MS } = await import('./sportsConstants.ts')
await loadWorld()

const shipped = parseSkatingRules(JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/skating.json', import.meta.url), 'utf8')))
const GRID: [number, number][] = [-119.5, -118, -116.5, -115.5].flatMap((z) => [[-332, z], [-334, z]] as [number, number][])
const rules: SkatingRules = {
  ...shipped,
  rink: RINK,
  oval: { a: [-340, -125], b: [-320, -125], radius: 4, startLineX: -330, grid: GRID }
}
rink.registerSkating(rules, 'test_rink', COACH, [{ key: 'laps', label: 'Laps', options: [1, 3, 5] }])
api.replies.set('GET /sports/gear', () => json({ gear: ['gear_ice_skates'] }))
api.replies.set('POST /sports/matches', () => json({ match: { id: 1, recorded: true } }))

const NOW = 9_000_000
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

async function arrive(accountIds: number[]): Promise<{ room: FakeRoom, players: Player[] }> {
  const players = await Promise.all(accountIds.map((id) => makePlayer(id, COACH.x, COACH.z + 1)))
  for (const p of players) p.sportsPassUntil = NOW * 10
  const room = await fakeRoom(players)
  for (const p of players) {
    p.z = ZONE.maxZ + 1
    assert.equal(moveRejection(room, p, COACH.x, p.y, COACH.z + 1, NOW), null)
    p.z = COACH.z + 1
    p.lastMoveAt = NOW
  }
  await flush()
  return { room, players }
}

function step(room: FakeRoom, p: Player, x: number, z: number, now: number) {
  const rejection = moveRejection(room, p, x, p.y, z, now)
  if (rejection === null) {
    p.x = x
    p.z = z
    p.lastMoveAt = now
  }
  return rejection
}

async function race(laps: number, accountIds: number[]) {
  const arrived = await arrive(accountIds)
  const { room, players } = arrived
  for (const p of players) {
    await venues.onSportsSignup(room, clientOf(room, p), { coach: COACH.id, venue: rink.SKATING_VENUE, settings: { laps } }, NOW)
  }
  const kickoffAt = players.length === rules.maxPlayers ? NOW : NOW + KICKOFF_COUNTDOWN_MS
  venues.tickSports(room, kickoffAt)
  return { ...arrived, kickoffAt, goAt: kickoffAt + rules.startCountdownMs }
}

function lapAround(room: FakeRoom, p: Player, from: number, z = -119.5): number {
  const points: [number, number][] = [[-318, z], [-314, -125], [-318, -130.5], [-342, -130.5], [-346, -125], [-342, z], [-329, z]]
  let now = from
  for (const [x, zz] of points) {
    now += 400
    p.x = x
    p.z = zz
    venues.tickSports(room, now)
  }
  return now
}

test('without skates the ice refuses the player, with skates the skate speed is allowed', async () => {
  api.replies.set('GET /sports/gear', () => json({ gear: [] }))
  const { room, players: [p] } = await arrive([1])
  assert.equal(step(room, p, COACH.x, RINK.maxZ - 1, NOW + 4000), 'no_skates')
  api.replies.set('GET /sports/gear', () => json({ gear: ['gear_ice_skates'] }))
  const { room: room2, players: [q] } = await arrive([2])
  q.x = RINK.maxX + 1
  q.z = -120
  assert.equal(step(room2, q, RINK.maxX - 1, -120, NOW + 1000), null)
  assert.equal(step(room2, q, RINK.maxX - 11, -120, NOW + 2000), null, '10 m in 1 s on skates')
  assert.equal(step(room2, q, RINK.maxX - 25, -120, NOW + 3000), 'too_fast', '14 m in 1 s is past the skate cap')
})

test('kick-off puts racers on the grid and holds them until the start', async () => {
  const { room, players: [p], goAt } = await race(1, [10])
  assert.deepEqual([p.x, p.z], GRID[0])
  const sent = sentOf(clientOf(room, p), 'position_correction') as { reason: string }[]
  assert.equal(sent.at(-1)?.reason, 'skate_grid')
  assert.equal(step(room, p, GRID[0][0] + 2, GRID[0][1], goAt - 500), 'skate_start')
  const view = sentOf(clientOf(room, p), 'skate_race').at(-1) as { phase: string, laps: number }
  assert.deepEqual([view.phase, view.laps], ['countdown', 1])
})

test('moves on the ice follow the replayed pushes during a race', async () => {
  const { room, players: [p], goAt } = await race(3, [11])
  const client = clientOf(room, p)
  assert.equal(step(room, p, GRID[0][0] + 4, GRID[0][1], goAt + 1000), 'too_fast', 'no push, no speed')
  rink.onSkatePush(room, client, goAt + 100)
  rink.onSkatePush(room, client, goAt + 750)
  assert.equal(step(room, p, GRID[0][0] + 3, GRID[0][1], goAt + 1500), null)
})

test('a race counts laps, adds a penalty for a cut, ends and records the result', async () => {
  api.calls.length = 0
  const { room, players: [p], goAt } = await race(1, [12])
  venues.tickSports(room, goAt)
  p.x = -330
  p.z = -124
  venues.tickSports(room, goAt + 200)
  p.x = -329
  p.z = -119.5
  const end = lapAround(room, p, goAt + 400)
  const result = sentOf(clientOf(room, p), 'skate_result').at(-1) as { results: { place: number, timeMs: number, penaltyMs: number }[] }
  assert.equal(result.results[0].place, 1)
  assert.equal(result.results[0].penaltyMs, 2000)
  assert.equal(result.results[0].timeMs, end - goAt + 2000)
  await flush()
  const record = api.calls.find((c) => c.url === '/sports/matches')?.body as { venue: string, players: unknown[] }
  assert.equal(record.venue, rink.SKATING_VENUE)
  assert.deepEqual(record.players, [{ accountId: 12, team: null, result: 'finished', place: 1, timeMs: end - goAt + 2000 }])
})

test('leaving the ice during a race is a did-not-finish', async () => {
  api.calls.length = 0
  const { room, players: [a, b], goAt } = await race(1, [13, 14])
  venues.tickSports(room, goAt)
  a.x = RINK.maxX + 1
  venues.tickSports(room, goAt + 300)
  assert.equal(rink.racerIn(room, 13)?.dnf, true)
  b.x = RINK.maxX + 1
  venues.tickSports(room, goAt + 600)
  const result = sentOf(clientOf(room, b), 'skate_result').at(-1) as { results: { dnf: boolean }[] }
  assert.deepEqual(result.results.map((r) => r.dnf), [true, true])
})

test('two fast skaters who touch both fall', async () => {
  const { room, players: [a, b], goAt } = await race(5, [15, 16])
  venues.tickSports(room, goAt)
  for (const p of [a, b]) for (let t = goAt; t <= goAt + 3900; t += 650) rink.onSkatePush(room, clientOf(room, p), t)
  a.x = -325
  a.z = -118
  b.x = -325.4
  b.z = -118
  venues.tickSports(room, goAt + 4000)
  const falls = sentOf(clientOf(room, a), 'skate_fall') as { sessionId: string, until: number }[]
  assert.deepEqual(falls.map((f) => f.sessionId).sort(), [a.sessionId, b.sessionId].sort())
  assert.equal(falls[0].until, goAt + 4000 + rules.crash.fallMs)
  assert.equal(step(room, a, -323, -118, goAt + 4500), 'skate_fallen')
})

test('the shipped zone file holds the rink coach off the ice, in the venue footprint', async () => {
  const { coachProp } = await import('./skating.ts')
  const zoneFile = JSON.parse(readFileSync(new URL('../../../front/public/assets/zones/sports_ice_rink.json', import.meta.url), 'utf8'))
  const coach = coachProp(zoneFile, 'rink_coach', 'sports_ice_rink')
  assert.ok(coach.x > -562 && coach.x < -481 && coach.z > -301 && coach.z < -250)
  const { insideRink } = await import('./skatingSim.ts')
  assert.ok(!insideRink(shipped.rink, coach.x, coach.z))
  assert.throws(() => coachProp(zoneFile, 'nobody', 'sports_ice_rink'), /no coach prop/)
})
