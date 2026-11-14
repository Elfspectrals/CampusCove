import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import type { Player } from '../types.ts'
import { type FakeRoom, api, clientOf, fakeRoom, installWorld, json, makePlayer, manifest, sentOf } from './testWorld.ts'

const HALL = { minX: -580, maxX: -543, minZ: -216, maxZ: -191 }
manifest.bounds = { minX: -650, maxX: 650, minZ: -650, maxZ: 650 }
manifest.zones.push({ key: 'sports_climbing', sportsPass: true, bounds: HALL })
installWorld()
const { loadWorld } = await import('../world.ts')
const climbing = await import('./climbing.ts')
const venues = await import('./venues.ts')
const { CLIMBING_SHOES } = await import('./sportsConstants.ts')
await loadWorld()
const rules = climbing.setClimbingRules(JSON.parse(await readFile(new URL('../../../front/public/assets/sports/rules/climbing.json', import.meta.url), 'utf8')))
api.replies.set('POST /sports/matches', () => json({ match: { id: 1, recorded: true } }))
api.replies.set('POST /tasks/climb-topped', () => json({ ok: true }))

const NOW = 10_000_000
const COACH = { x: -571.8, z: -203.5 }

interface ClimbState {
  sessionId: string
  line: string
  event: string
  phase: string
  next: number
  grip: number
  litAt: number
  opensAt: number
  result?: string
  timeMs?: number
}

function standAt(id: string): { x: number, z: number } {
  const line = rules.lines.get(id)
  if (!line) throw new Error(id)
  const n = line.face === 'east' ? { x: 1, z: 0 } : line.face === 'north' ? { x: 0, z: -1 } : { x: 0, z: 1 }
  return { x: line.base.x + n.x * 1.1, z: line.base.z + n.z * 1.1 }
}

async function climber(accountId: number, at: { x: number, z: number }, shoes = true): Promise<Player> {
  const player = await makePlayer(accountId, at.x, at.z)
  player.sportsPassUntil = NOW * 10
  if (shoes) player.sportsLoans.set(CLIMBING_SHOES, 'sports_complex')
  return player
}

function states(room: FakeRoom, player: Player): ClimbState[] {
  return sentOf(clientOf(room, player), 'climb_state') as ClimbState[]
}

function last(room: FakeRoom, player: Player): ClimbState {
  return states(room, player).at(-1) as ClimbState
}

function own(room: FakeRoom, player: Player): ClimbState {
  return states(room, player).filter((s) => s.sessionId === player.sessionId).at(-1) as ClimbState
}

function errors(room: FakeRoom, player: Player): string[] {
  return (sentOf(clientOf(room, player), 'climb_error') as { code: string }[]).map((e) => e.code)
}

function climbAll(room: FakeRoom, player: Player, holds: number, from: number): number {
  let at = from
  for (let i = 0; i < holds; i++) {
    at += 800
    climbing.onClimbHold(room, clientOf(room, player), { hold: i }, at)
  }
  return at
}

test('starting a climb needs the lent shoes and the start of a free line', async () => {
  const bare = await climber(1, standAt('route_1'), false)
  const far = await climber(2, { x: -560, z: -203.5 })
  const ok = await climber(3, standAt('route_1'))
  const late = await climber(4, standAt('route_1'))
  const room = await fakeRoom([bare, far, ok, late])
  climbing.onClimbStart(room, clientOf(room, bare), { line: 'route_1' }, NOW)
  climbing.onClimbStart(room, clientOf(room, far), { line: 'route_1' }, NOW)
  climbing.onClimbStart(room, clientOf(room, ok), { line: 'nope' }, NOW)
  climbing.onClimbStart(room, clientOf(room, ok), { line: 'route_1' }, NOW)
  climbing.onClimbStart(room, clientOf(room, late), { line: 'route_1' }, NOW)
  assert.deepEqual(errors(room, bare), ['climb_no_shoes'])
  assert.deepEqual(errors(room, far), ['climb_too_far'])
  assert.deepEqual(errors(room, late), ['climb_line_taken'])
  assert.equal(last(room, ok).event, 'start')
  assert.equal(last(room, late).sessionId, ok.sessionId)
  const moved = sentOf(clientOf(room, ok), 'position_correction').at(-1) as { x: number, reason: string }
  assert.deepEqual([moved.x, moved.reason], [-576.3 + 0.55, 'climbing'])
  assert.ok(room.moves.includes(ok.sessionId))
})

test('a topped boulder ends at once on the mat and records the time; nothing for a hold clicked out of a climb', async () => {
  const p = await climber(10, standAt('boulder_1'))
  const room = await fakeRoom([p])
  api.calls.length = 0
  climbing.onClimbHold(room, clientOf(room, p), { hold: 0 }, NOW)
  climbing.onClimbStart(room, clientOf(room, p), { line: 'boulder_1' }, NOW)
  const end = climbAll(room, p, 5, NOW)
  const ended = last(room, p)
  assert.deepEqual([ended.phase, ended.result, ended.timeMs], ['ended', 'topped', 3200])
  assert.equal(climbing.climbOf(room, p.sessionId), undefined)
  await new Promise((resolve) => setImmediate(resolve))
  const call = api.calls.find((c) => c.url === '/sports/matches')
  assert.ok(call)
  const body = call.body as { sport: string, venue: string, startedAt: number, endedAt: number, players: unknown[] }
  assert.deepEqual([body.sport, body.venue, body.startedAt, body.endedAt], ['climbing', 'boulder_1', NOW + 800, end])
  assert.deepEqual(body.players, [{ accountId: 10, team: null, result: 'finished', timeMs: 3200 }])
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(api.calls.find((c) => c.url === '/tasks/climb-topped')?.body, { ref: (call.body as { ref: string }).ref, line: 'boulder_1', colour: 'green' })
  assert.deepEqual((call.body as { settings: unknown }).settings, { line: 'boulder_1' })
})

test('a fall on the lead wall lowers the climber for 2 s and records no time', async () => {
  const p = await climber(20, standAt('route_4'))
  const room = await fakeRoom([p])
  api.calls.length = 0
  climbing.onClimbStart(room, clientOf(room, p), { line: 'route_4' }, NOW)
  const reached = climbAll(room, p, 6, NOW)
  const high = p.y
  for (const at of [reached + 100, reached + 200, reached + 300]) climbing.onClimbHold(room, clientOf(room, p), { hold: 9 }, at)
  assert.deepEqual([last(room, p).event, last(room, p).phase], ['fall', 'lowering'])
  climbing.tickClimbing(room, reached + 1300)
  assert.ok(p.y < high && p.y > 0.2 + 1.6)
  climbing.tickClimbing(room, reached + 2300)
  assert.deepEqual([last(room, p).phase, last(room, p).result, last(room, p).timeMs], ['ended', 'fell', undefined])
  assert.equal(p.y, 0.2 + 1.6)
  assert.equal(api.calls.length, 0)
})

test('letting go, losing the shoes or walking off the wall stops the climb with no time', async () => {
  const a = await climber(30, standAt('route_2'))
  const b = await climber(31, standAt('boulder_2'))
  const room = await fakeRoom([a, b])
  climbing.onClimbStart(room, clientOf(room, a), { line: 'route_2' }, NOW)
  climbing.onClimbStart(room, clientOf(room, b), { line: 'boulder_2' }, NOW)
  climbing.onClimbLetGo(room, clientOf(room, a), NOW + 500)
  assert.deepEqual([last(room, a).event, last(room, a).phase], ['fall', 'lowering'])
  b.sportsLoans.clear()
  climbing.tickClimbing(room, NOW + 600)
  assert.deepEqual([last(room, b).phase, last(room, b).result], ['ended', 'cancelled'])
  a.x += 3
  climbing.tickClimbing(room, NOW + 700)
  assert.deepEqual([last(room, a).phase, last(room, a).result], ['ended', 'cancelled'])
})

test('a topped route is lowered and ends with its time', async () => {
  const p = await climber(40, standAt('route_1'))
  const room = await fakeRoom([p])
  climbing.onClimbStart(room, clientOf(room, p), { line: 'route_1' }, NOW)
  const end = climbAll(room, p, 10, NOW)
  assert.deepEqual([last(room, p).event, last(room, p).phase], ['top', 'lowering'])
  climbing.tickClimbing(room, end + 2000)
  assert.deepEqual([last(room, p).result, last(room, p).timeMs], ['topped', 7200])
})

test('speed duel: the coach starts both climbers on the twin lanes and the first to the top wins', async () => {
  const a = await climber(50, { x: COACH.x, z: COACH.z + 1 })
  const b = await climber(51, { x: COACH.x, z: COACH.z - 1 })
  const free = await climber(52, standAt('speed_2'))
  const room = await fakeRoom([a, b, free])
  climbing.onClimbStart(room, clientOf(room, free), { line: 'speed_2' }, NOW - 5000)
  api.calls.length = 0
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'climbing_duel', venue: 'climbing_duel' }, NOW)
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'climbing_duel', venue: 'climbing_duel' }, NOW)
  assert.equal(own(room, free).result, 'cancelled')
  const match = room.sports.matches.get('climbing_duel')
  assert.ok(match)
  const climbA = own(room, a)
  assert.deepEqual([climbA.line, climbA.litAt], ['speed_1', match.startedAt + 3000])
  assert.equal(states(room, a).find((s) => s.sessionId === b.sessionId)?.line, 'speed_2')
  Object.assign(free, standAt('speed_1'))
  climbing.onClimbStart(room, clientOf(room, free), { line: 'speed_1' }, NOW + 10)
  assert.ok(errors(room, free).includes('climb_lane_reserved'))
  const start = match.startedAt + 3000
  climbing.onClimbHold(room, clientOf(room, b), { hold: 0 }, start + 800)
  climbAll(room, a, 14, start)
  assert.equal(room.sports.matches.has('climbing_duel'), false)
  assert.equal(states(room, a).find((s) => s.sessionId === a.sessionId && s.phase === 'ended')?.result, 'won')
  assert.equal(own(room, b).result, 'beaten')
  await new Promise((resolve) => setImmediate(resolve))
  const record = api.calls.find((c) => c.url === '/sports/matches')?.body as { venue: string, players: { accountId: number, result: string, timeMs?: number }[] }
  assert.equal(record.venue, 'climbing_duel')
  assert.deepEqual(record.players.map((p) => [p.accountId, p.result, p.timeMs]), [[50, 'win', 14 * 800 - 800], [51, 'loss', undefined]])
  await new Promise((resolve) => setImmediate(resolve))
  const counted = api.calls.filter((c) => c.url === '/tasks/climb-topped').map((c) => c.body)
  assert.deepEqual(counted, [{ ref: match.id, line: 'speed_1', colour: 'red' }])
})

test('speed duel: when both climbers fall nobody wins', async () => {
  const a = await climber(60, { x: COACH.x, z: COACH.z + 1 })
  const b = await climber(61, { x: COACH.x, z: COACH.z - 1 })
  const room = await fakeRoom([a, b])
  api.calls.length = 0
  await venues.onSportsSignup(room, clientOf(room, a), { coach: 'climbing_duel', venue: 'climbing_duel' }, NOW)
  await venues.onSportsSignup(room, clientOf(room, b), { coach: 'climbing_duel', venue: 'climbing_duel' }, NOW)
  climbing.onClimbLetGo(room, clientOf(room, a), NOW + 4000)
  assert.equal(room.sports.matches.has('climbing_duel'), true)
  climbing.onClimbLetGo(room, clientOf(room, b), NOW + 4100)
  assert.equal(room.sports.matches.has('climbing_duel'), false)
  await new Promise((resolve) => setImmediate(resolve))
  const record = api.calls.find((c) => c.url === '/sports/matches')?.body as { players: { result: string }[] }
  assert.deepEqual(record.players.map((p) => p.result), ['dnf', 'dnf'])
})

test('a player walking into the hall gets the climbs already on the wall', async () => {
  const climberIn = await climber(70, standAt('route_3'))
  const visitor = await climber(71, { x: -540, z: -203.5 })
  const room = await fakeRoom([climberIn, visitor])
  climbing.tickClimbing(room, NOW)
  climbing.onClimbStart(room, clientOf(room, climberIn), { line: 'route_3' }, NOW)
  assert.equal(states(room, visitor).length, 0)
  Object.assign(visitor, { x: -550, z: -203.5 })
  climbing.tickClimbing(room, NOW + 100)
  climbing.tickClimbing(room, NOW + 200)
  assert.deepEqual(states(room, visitor).map((s) => [s.sessionId, s.line]), [[climberIn.sessionId, 'route_3']])
})
