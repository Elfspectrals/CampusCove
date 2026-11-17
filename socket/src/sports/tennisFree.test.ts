import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import type { Player } from '../types.ts'
import { type FakeRoom, api, clientOf, fakeRoom, installWorld, json, makePlayer, manifest, sentOf } from './testWorld.ts'

const tennisZone = manifest.zones.find((z) => z.key === 'sports_tennis')
if (!tennisZone) throw new Error('the test world has no sports_tennis zone')
tennisZone.bounds = { minX: -467, maxX: -420, minZ: -293, maxZ: -250 }

installWorld()
const { loadWorld } = await import('../world.ts')
await loadWorld()
const C = await import('./tennisConstants.ts')
const free = await import('./tennisFree.ts')
const { onTennisHit } = await import('./tennis.ts')
const { tossPeak, groundTime } = await import('./tennisRally.ts')

const NOW = 7_000_000
const [BASKET_1] = C.BALL_BASKETS
const [COURT_1] = C.TENNIS_COURTS

async function atBasket(gear: string[] = [C.TENNIS_GEAR]): Promise<{ room: FakeRoom, player: Player }> {
  const player = await makePlayer(1, BASKET_1.x, BASKET_1.z + 1)
  player.sportsPassUntil = NOW * 10
  api.replies.set('GET /sports/gear', () => json({ gear }))
  return { room: await fakeRoom([player]), player }
}

function errors(room: FakeRoom, player: Player): string[] {
  return (sentOf(clientOf(room, player), 'sports_error') as { code: string }[]).map((e) => e.code)
}

test('a player with a pass and a racket takes a ball at the basket of a free court', async () => {
  const { room, player } = await atBasket()
  await free.onTennisBallTake(room, clientOf(room, player), { court: BASKET_1.court }, NOW)
  assert.ok(player.sportsLoans.has(C.TENNIS_BALL_LOAN))
  assert.deepEqual(sentOf(clientOf(room, player), 'sports_loans').at(-1), { sessionId: player.sessionId, loans: [C.TENNIS_BALL_LOAN] })
})

test('the basket refuses from afar, without a pass, without a racket, and while a match is on its court', async () => {
  const far = await atBasket()
  far.player.x += 5
  await free.onTennisBallTake(far.room, clientOf(far.room, far.player), { court: BASKET_1.court }, NOW)
  const noPass = await atBasket()
  noPass.player.sportsPassUntil = null
  await free.onTennisBallTake(noPass.room, clientOf(noPass.room, noPass.player), { court: BASKET_1.court }, NOW)
  const noGear = await atBasket([])
  await free.onTennisBallTake(noGear.room, clientOf(noGear.room, noGear.player), { court: BASKET_1.court }, NOW)
  const busy = await atBasket()
  busy.room.sports.matches.set(BASKET_1.court, {} as never)
  await free.onTennisBallTake(busy.room, clientOf(busy.room, busy.player), { court: BASKET_1.court }, NOW)
  assert.deepEqual([far, noPass, noGear, busy].map(({ room, player }) => errors(room, player)), [['sports_too_far'], ['sports_no_pass'], ['sports_no_gear'], ['sports_venue_busy']])
  assert.ok([far, noPass, noGear, busy].every(({ player }) => player.sportsLoans.size === 0))
})

test('free play: the ball holder tosses and serves on a free court, the rally ends with no score and the court is free again', async () => {
  const server = await makePlayer(1, COURT_1.cx, C.TENNIS_NET_Z - 11)
  const room = await fakeRoom([server])
  const client = clientOf(room, server)
  const aim = { aimX: COURT_1.cx, aimZ: C.TENNIS_NET_Z + 8 }
  onTennisHit(room, client, aim, NOW)
  assert.equal(free.freeRally(room, COURT_1.id), null)
  server.sportsLoans.set(C.TENNIS_BALL_LOAN, C.TENNIS_ZONE)
  onTennisHit(room, client, aim, NOW)
  const toss = free.freeRally(room, COURT_1.id)?.rally
  assert.equal(toss?.phase, 'toss')
  const peak = tossPeak((toss as { ball: Parameters<typeof tossPeak>[0] }).ball)
  onTennisHit(room, client, aim, peak)
  const flight = free.freeRally(room, COURT_1.id)?.rally as { phase: string, ball: Parameters<typeof groundTime>[0] }
  assert.equal(flight.phase, 'flight')
  assert.equal((sentOf(client, 'tennis_free').at(-1) as { phase: string }).phase, 'flight')
  let t = peak
  while (free.freeRally(room, COURT_1.id)?.rally.phase === 'flight') free.tickTennisFree(room, (t += 100))
  assert.equal(free.freeRally(room, COURT_1.id)?.rally.phase, 'point')
  free.tickTennisFree(room, t + C.POINT_PAUSE_MS)
  assert.equal(free.freeRally(room, COURT_1.id), null)
  assert.equal((sentOf(client, 'tennis_free').at(-1) as { phase: string }).phase, 'idle')
})

test('a free rally stops when a match kicks off on its court', async () => {
  const p = await makePlayer(1, COURT_1.cx, C.TENNIS_NET_Z - 11)
  const room = await fakeRoom([p])
  p.sportsLoans.set(C.TENNIS_BALL_LOAN, C.TENNIS_ZONE)
  onTennisHit(room, clientOf(room, p), { aimX: COURT_1.cx, aimZ: C.TENNIS_NET_Z + 8 }, NOW)
  assert.ok(free.freeRally(room, COURT_1.id))
  free.stopFreeRally(room, COURT_1.id, NOW)
  assert.equal(free.freeRally(room, COURT_1.id), null)
  assert.equal(free.courtAt(COURT_1.cx, C.TENNIS_NET_Z), COURT_1)
  assert.equal(free.courtAt(C.TENNIS_COACH.x, C.TENNIS_COACH.z), null)
})

test('the ball baskets stand where the zone file puts them', () => {
  const zone = JSON.parse(readFileSync(new URL('../../../front/public/assets/zones/sports_tennis.json', import.meta.url), 'utf8'))
  const baskets = zone.props.filter((p: { key?: string }) => p.key === 'tennis_ball_basket').map((p: { position: number[] }) => [p.position[0], p.position[2]])
  assert.deepEqual(baskets, C.BALL_BASKETS.map((b) => [b.x, b.z]))
})
