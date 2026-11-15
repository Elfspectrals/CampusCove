import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mock, test } from 'node:test'
import type { Match } from './signup.ts'
import { noteKind, noteTimeMs } from './swimRace.ts'
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
const { parseSwimPool, rescuePoint } = await import('./poolSwim.ts')
await loadWorld()

const { rules, spec } = pool.poolVenueSpec(RAW, () => 0)
configurePoolWater(parseSwimPool(RAW, rules), pool.POOL_ZONE)
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
  assert.deepEqual(sentOf(clientOf(room, b), 'pool_stroke_result'), [{ result: 'false_start', index: null, reactionMs: null }])
  pool.onPoolStroke(room, clientOf(room, a), { side: 'up' })
  assert.equal(sentOf(clientOf(room, a), 'pool_stroke_result').length, 0)

  mock.timers.setTime(T0 + rules.beepDelayMs[0])
  spec.onTick(room, match)
  assert.equal(sentOf(clientOf(room, a), 'pool_race_beep').length, 1)
  mock.timers.setTime(Date.now() + 250)
  pool.onPoolDive(room, clientOf(room, a))
  assert.deepEqual(sentOf(clientOf(room, a), 'pool_stroke_result').at(-1), { result: 'started', index: null, reactionMs: 250 })

  const beepAt = T0 + rules.beepDelayMs[0]
  for (let i = 0; i < 80 && room.sports.matches.has(spec.id); i++) {
    mock.timers.setTime(beepAt + noteTimeMs(rules.rhythm, i))
    pool.onPoolStroke(room, clientOf(room, a), { side: noteKind(rules.rhythm, i) })
    venues.tickSports(room)
  }
  assert.deepEqual(sentOf(clientOf(room, a), 'pool_stroke_result')[1], { result: 'perfect', index: 0, reactionMs: 250 })
  assert.equal(sentOf(clientOf(room, a), 'pool_stroke_result').some((m) => (m as { result: string }).result === 'miss'), false)
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

test('swimming: faster than a fast swimmer or under the pool floor is refused, a diver coming in from above is not speed-checked', async () => {
  const swimmer = await makePlayer(331, -505, -212)
  swimmer.y = -0.15
  swimmer.lastMoveAt = Date.now() - 1000
  const room = await fakeRoom([swimmer])
  api.replies.set('GET /sports/gear', () => json({ gear: ['gear_swimsuit'] }))
  assert.equal(moveRejection(room, swimmer, -505 + 4, -0.15, -212, Date.now()), null)
  assert.equal(moveRejection(room, swimmer, -505 + 7, -0.15, -212, Date.now()), 'swim_too_fast')
  assert.equal(moveRejection(room, swimmer, -505, -1.8, -212, Date.now()), 'below_pool_floor')
  assert.equal(moveRejection(room, swimmer, -505, -1.6, -212, Date.now()), null)
  const diver = await makePlayer(332, -525, -210)
  diver.y = 6.6
  diver.lastMoveAt = Date.now() - 1000
  assert.equal(moveRejection(room, diver, -525, -3.5, -210, Date.now()), null)
})

test('breath: drains under water, the lifeguard pulls an empty swimmer onto the deck, the rescue hurts but never knocks out', async () => {
  const { tickPoolBreath } = await import('./poolWater.ts')
  const swimmer = await makePlayer(341, -505, -212)
  swimmer.stats = { health: 5, hunger: 100, thirst: 100 }
  swimmer.y = -1.2
  const room = await fakeRoom([swimmer])
  const client = clientOf(room, swimmer)
  const start = Date.now()
  tickPoolBreath(room, start)
  tickPoolBreath(room, start + 10_000)
  const [first] = sentOf(client, 'pool_breath').slice(-1) as { breathMs: number, maxMs: number, underwater: boolean }[]
  assert.deepEqual(first, { breathMs: 20_000, maxMs: 30_000, underwater: true })
  tickPoolBreath(room, start + 30_000)
  assert.equal(sentOf(client, 'pool_rescued').length, 1)
  assert.equal(swimmer.y, 1.6)
  assert.ok(swimmer.z < -219.5)
  assert.equal(swimmer.stats?.health, 1)
  tickPoolBreath(room, start + 40_000)
  const [last] = sentOf(client, 'pool_breath').slice(-1) as { breathMs: number, underwater: boolean }[]
  assert.deepEqual(last, { breathMs: 30_000, maxMs: 30_000, underwater: false })
  const before = client.sent.length
  tickPoolBreath(room, start + 41_000)
  assert.equal(client.sent.length, before)
})

test('a dive from the 5 m platform into the pit does not hurt, the same drop onto the deck does', async () => {
  const { onSurvivalMove } = await import('../survival.ts')
  for (const [x, z, hurts] of [[-525, -210, false], [-525, -222, true]] as const) {
    const diver = await makePlayer(351, x, z)
    diver.stats = { health: 100, hunger: 100, thirst: 100 }
    const room = await fakeRoom([diver])
    diver.fallPeakY = 6.6
    diver.y = hurts ? 1.6 : -2.4
    onSurvivalMove(room, clientOf(room, diver), diver, 3, 0)
    diver.y += 0.2
    onSurvivalMove(room, clientOf(room, diver), diver, diver.y - 0.2, 0)
    assert.equal(sentOf(clientOf(room, diver), 'survival_damage').length > 0, hurts)
  }
})

test('every rescue point is on the deck beside its water', () => {
  const layout = JSON.parse(readFileSync(new URL('../../../front/public/assets/park/sports_pool/sports_pool.layout.json', import.meta.url), 'utf8'))
  const deck = layout.levels.find((l: { id: string }) => l.id === 'L0').rects as { minX: number, maxX: number, minZ: number, maxZ: number }[]
  const swimPool = parseSwimPool(RAW, rules)
  for (const w of swimPool.water) {
    for (const x of [w.minX + 0.1, (w.minX + w.maxX) / 2, w.maxX - 0.1]) {
      const p = rescuePoint(swimPool, x, (w.minZ + w.maxZ) / 2)
      assert.ok(p && deck.some((r) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ), `${x} -> ${JSON.stringify(p)}`)
    }
  }
})
