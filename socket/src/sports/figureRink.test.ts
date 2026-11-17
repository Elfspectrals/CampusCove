import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { api, clientOf, fakeRoom, installWorld, json, makePlayer, manifest, sentOf } from './testWorld.ts'

const RINK = { minX: -350, maxX: -310, minZ: -135, maxZ: -115 }
const ZONE = { minX: -360, maxX: -305, minZ: -140, maxZ: -105 }
const COACH = { x: -345, z: -110 }
;(manifest.zones as object[]).push({ key: 'test_figure_rink', sportsPass: true, bounds: ZONE })
installWorld()
const { loadWorld } = await import('../world.ts')
const venues = await import('./venues.ts')
const figure = await import('./figureRink.ts')
const { parseFigureRules, figurePosition } = await import('./figureSkating.ts')
await loadWorld()

const RAW = JSON.parse(readFileSync(new URL('../../../front/public/assets/sports/rules/figure_skating.json', import.meta.url), 'utf8'))
const rules = parseFigureRules({ ...RAW, route: { ...RAW.route, a: [-340, -125], b: [-320, -125], radius: 4, laneOffsetsM: [0, 2] } })
const SKATERS = [{ key: 'skaters', label: 'Skaters', options: [1, 2] }]
figure.registerFigureSkating(rules, 'test_figure', 'test_figure_rink', COACH, RINK, 'test_ice', 'gear_ice_skates', SKATERS)
api.replies.set('GET /sports/gear', () => json({ gear: ['gear_ice_skates'] }))

const NOW = 9_000_000
const JUMP_AT = rules.elements[0].atMs

async function signed(accountIds: number[]) {
  const players = await Promise.all(accountIds.map((id) => makePlayer(id, COACH.x, COACH.z + 1)))
  for (const p of players) p.sportsPassUntil = NOW * 10
  const room = await fakeRoom(players)
  for (const [i, p] of players.entries()) {
    await venues.onSportsSignup(room, clientOf(room, p), { coach: 'test_figure', venue: 'test_figure', settings: i === 0 ? { skaters: players.length } : undefined }, NOW + i * 1000)
  }
  return { room, players, startAt: NOW + (players.length - 1) * 1000 + rules.countdownMs }
}

test('the routine starts when the chosen number of skaters signed up: each is put at the start of their lane and told when the music starts', async () => {
  const { room, players: [a, b], startAt } = await signed([701, 702])
  assert.ok(room.sports.matches.has('test_figure'))
  assert.deepEqual([a.x, a.z], [-340, -121])
  assert.deepEqual([b.x, b.z], [-340, -119])
  assert.equal((sentOf(clientOf(room, a), 'position_correction').at(-1) as { reason: string }).reason, 'figure_start')
  assert.deepEqual(sentOf(clientOf(room, b), 'figure_start'), [{
    venue: 'test_figure', startAt, serverNow: NOW + 1000,
    skaters: [{ sessionId: a.sessionId, name: a.pseudo, lane: 0 }, { sessionId: b.sessionId, name: b.pseudo, lane: 1 }]
  }])
})

test('the socket carries the skaters along the route, judges the presses and shows them to the rink; the routine ends with the music', async () => {
  const { room, players: [a], startAt } = await signed([703])
  venues.tickSports(room, startAt + JUMP_AT)
  const spot = figurePosition(rules.route, 0, JUMP_AT)
  assert.deepEqual([a.x, a.z, a.ry], [spot.x, spot.z, spot.ry])
  figure.onFigurePress(room, clientOf(room, a), { key: 'spin' }, startAt + JUMP_AT)
  figure.onFigurePress(room, clientOf(room, a), { key: 'jump' }, startAt + JUMP_AT + 10)
  figure.onFigurePress(room, clientOf(room, a), { key: 'left' }, startAt + JUMP_AT + 30)
  figure.onFigurePress(room, clientOf(room, a), { key: 'left' }, startAt + JUMP_AT + 100)
  assert.deepEqual(sentOf(clientOf(room, a), 'figure_event'), [
    { venue: 'test_figure', sessionId: a.sessionId, score: 300, type: 'judge', index: 0, element: 'jump', judgement: 'perfect' },
    { venue: 'test_figure', sessionId: a.sessionId, score: 400, type: 'rotation', rotations: 1 }
  ])
  venues.tickSports(room, startAt + JUMP_AT + 200)
  const state = sentOf(clientOf(room, a), 'figure_state').at(-1) as { skaters: { score: number, next: number, air: { rotations: number } | null }[] }
  assert.deepEqual([state.skaters[0].score, state.skaters[0].next, state.skaters[0].air?.rotations], [400, 1, 1])
  figure.onFigureRelease(room, clientOf(room, a), startAt + JUMP_AT + 300)
  assert.equal(sentOf(clientOf(room, a), 'figure_event').length, 2)
  venues.tickSports(room, startAt + rules.lengthMs)
  assert.equal(room.sports.matches.has('test_figure'), false)
  const end = sentOf(clientOf(room, a), 'figure_end').at(-1) as { results: { score: number, place: number | null, judged: string[] }[] }
  assert.deepEqual([end.results[0].score, end.results[0].place, end.results[0].judged.length, end.results[0].judged[0], end.results[0].judged[1]], [400, 1, rules.elements.length, 'perfect', 'miss'])
  const announced = sentOf(clientOf(room, a), 'figure_event').length
  assert.equal(announced, 2 + rules.elements.length - 1)
  figure.onFigurePress(room, clientOf(room, a), { key: 'jump' }, startAt + rules.lengthMs + 100)
  assert.equal(sentOf(clientOf(room, a), 'figure_event').length, announced)
  assert.equal(api.calls.some((c) => c.url === '/sports/matches'), false)
})

test('the only setting is the number of skaters, never more than the lanes', () => {
  assert.throws(() => figure.registerFigureSkating(rules, 'test_figure_2', 'test_figure_rink', COACH, RINK, 'test_ice', 'gear_ice_skates', [{ key: 'skaters', label: 'Skaters', options: [1, 3] }]), /skaters, from 1 to 2/)
})
