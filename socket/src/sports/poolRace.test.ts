import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mock, test } from 'node:test'
import type { Match } from './signup.ts'
import { api, clientOf, fakeRoom, installWorld, json, makePlayer, manifest, sentOf } from './testWorld.ts'

const RAW = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/swimming.json', import.meta.url), 'utf8'))
const POOL = { minX: -560, maxX: -470, minZ: -240, maxZ: -185 }
manifest.bounds = { minX: -650, maxX: 650, minZ: -650, maxZ: 650 }
manifest.zones.push({ key: 'sports_pool', sportsPass: true, bounds: POOL })

installWorld()
const { loadWorld } = await import('../world.ts')
const { moveRejection } = await import('../movement.ts')
const venues = await import('./venues.ts')
const pool = await import('./poolRace.ts')
const { configurePoolWater } = await import('./poolWater.ts')
await loadWorld()

const { rules, spec } = pool.poolVenueSpec(RAW, () => 0)
configurePoolWater(rules.water, pool.POOL_ZONE)
pool.usePoolRules(rules)
venues.registerVenue(spec)
const T0 = 2_000_000
mock.timers.enable({ apis: ['Date'], now: T0 })

function matchOf(players: { accountId: number, sessionId: string, pseudo: string }[], distanceM: number): Match {
  return {
    id: 'race-1',
    venue: spec.id,
    coach: spec.id,
    sport: 'swimming',
    settings: { distanceM },
    range: { min: 1, max: 6 },
    startedAt: T0,
    players: players.map((p) => ({ accountId: p.accountId, sessionId: p.sessionId, name: p.pseudo, team: null, awaySince: null, out: false }))
  }
}

test('the venue spec: pool coach, basin reserved, swimsuit required, solo race with no rejoin grace', () => {
  assert.equal(spec.id, 'pool_lanes')
  assert.equal(spec.zone, 'sports_pool')
  assert.equal(spec.gear, 'gear_swimsuit')
  assert.equal(spec.teams, false)
  assert.equal(spec.rejoinGraceMs, 0)
  assert.deepEqual(spec.players(), { min: 1, max: 6 })
  assert.ok(spec.playArea.maxX - spec.playArea.minX === 25)
})

test('a race: swimmers on their blocks, a false start, the beep, a swim to the wall, results and one record', async () => {
  const a = await makePlayer(301, -495, -221)
  const b = await makePlayer(302, -495, -221)
  const room = await fakeRoom([a, b])
  const match = matchOf([a, b], 25)
  room.sports.matches.set(spec.id, match)
  api.replies.set('POST /sports/matches', () => json({ match: { id: 1, recorded: true } }))

  spec.onKickoff(room, match)
  assert.deepEqual([a.x, a.z], [rules.lanes[0].block[0], rules.lanes[0].block[2]])
  assert.deepEqual([b.x, b.z], [rules.lanes[1].block[0], rules.lanes[1].block[2]])
  assert.equal((sentOf(clientOf(room, a), 'position_correction')[0] as { reason: string }).reason, 'pool_block')
  assert.equal(sentOf(clientOf(room, a), 'pool_race_start').length, 1)

  pool.onPoolStroke(room, clientOf(room, b), { side: 'left' })
  assert.deepEqual(sentOf(clientOf(room, b), 'pool_stroke_result'), [{ result: 'false_start', reactionMs: null }])
  pool.onPoolStroke(room, clientOf(room, a), { side: 'up' })
  assert.equal(sentOf(clientOf(room, a), 'pool_stroke_result').length, 0)

  mock.timers.setTime(T0 + rules.beepDelayMs[0])
  spec.onTick(room, match)
  assert.equal(sentOf(clientOf(room, a), 'pool_race_beep').length, 1)
  mock.timers.setTime(Date.now() + 250)
  pool.onPoolDive(room, clientOf(room, a))
  assert.deepEqual(sentOf(clientOf(room, a), 'pool_stroke_result').at(-1), { result: 'started', reactionMs: 250 })

  let side: 'left' | 'right' = 'left'
  for (let i = 0; i < 80 && room.sports.matches.has(spec.id); i++) {
    mock.timers.setTime(Date.now() + rules.stroke.goodCadenceMs)
    pool.onPoolStroke(room, clientOf(room, a), { side })
    side = side === 'left' ? 'right' : 'left'
    venues.tickSports(room)
  }
  assert.equal(room.sports.matches.has(spec.id), false)
  assert.ok(a.x <= rules.turnX + 0.01 && a.y < 1)
  const [result] = sentOf(clientOf(room, a), 'pool_race_result') as { results: { sessionId: string, place: number | null, status: string, timeMs: number | null }[] }[]
  assert.equal(result.results[0].place, 1)
  assert.equal(result.results[0].status, 'finished')
  assert.ok((result.results[0].timeMs as number) > 5000)
  assert.deepEqual(result.results[1], { ...result.results[1], place: null, status: 'disqualified', timeMs: null })
  await new Promise((resolve) => setImmediate(resolve))
  const records = api.calls.filter((c) => c.url === '/sports/matches')
  assert.equal(records.length, 1)
  const body = records[0].body as { players: { accountId: number, result: string, place?: number }[] }
  assert.deepEqual(body.players.map((p) => [p.accountId, p.result, p.place]), [[301, 'finished', 1], [302, 'dnf', undefined]])
})

test('a swimmer who leaves mid-race does not finish', async () => {
  const a = await makePlayer(311, -495, -221)
  const room = await fakeRoom([a])
  const match = matchOf([a], 50)
  room.sports.matches.set(spec.id, match)
  spec.onKickoff(room, match)
  spec.onLeave(room, match, a.accountId)
  venues.endMatch(room, spec.id, { reason: 'forfeit', loser: null })
  const [result] = sentOf(clientOf(room, a), 'pool_race_result') as { results: { status: string }[] }[]
  assert.equal(result.results[0].status, 'dnf')
})

test('the pool water refuses a player without a swimsuit, lets one with a swimsuit in and anyone out', async () => {
  const deck = { x: -493, z: -212 }
  const water = { x: -495, z: -212 }
  const without = await makePlayer(321, deck.x, deck.z)
  const owner = await makePlayer(322, deck.x, deck.z)
  const room = await fakeRoom([without, owner])
  let gear: string[] = []
  api.replies.set('GET /sports/gear', () => json({ gear }))
  for (const p of [without, owner]) {
    p.sportsPassUntil = Date.now() + 3_600_000
    p.lastMoveAt = Date.now() - 1000
  }
  assert.equal(moveRejection(room, without, water.x, 1.6, water.z, Date.now()), 'no_swimsuit')
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(moveRejection(room, without, water.x, 1.6, water.z, Date.now()), 'no_swimsuit')
  gear = ['gear_swimsuit']
  moveRejection(room, owner, deck.x, 1.6, deck.z, Date.now())
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(moveRejection(room, owner, water.x, 1.6, water.z, Date.now()), null)
  without.x = water.x
  without.z = water.z
  assert.equal(moveRejection(room, without, deck.x, 1.6, deck.z, Date.now()), null)
})
