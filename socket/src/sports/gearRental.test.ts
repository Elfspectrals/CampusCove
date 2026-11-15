import assert from 'node:assert/strict'
import { test } from 'node:test'
import { api, clientOf, fakeRoom, installWorld, json, makePlayer, sentOf } from './testWorld.ts'

installWorld()
const { loadWorld } = await import('../world.ts')
const venues = await import('./venues.ts')
const { usableGear, onGearChanged } = await import('./gear.ts')
const { onGearQuote, onGearRent } = await import('./gearRental.ts')
const { hasLoan, updateLoansOnMove } = await import('./loans.ts')
await loadWorld()

const TENNIS = { minX: -430, maxX: -422, minZ: -490, maxZ: -482 }
const INSIDE = { x: -426, z: -486 }
const RENTAL = { gear_tennis_racket: 30 }
const NOW = 1_000_000

venues.registerVenue({
  id: 'rental_court',
  sport: 'tennis',
  zone: 'sports_tennis',
  coach: { x: -426, z: -486 },
  playArea: { minX: -429, maxX: -423, minZ: -489, maxZ: -483 },
  gear: 'gear_tennis_racket',
  teams: true,
  settings: [],
  players: () => ({ min: 2, max: 2 }),
  rejoinGraceMs: 30_000,
  onKickoff: () => undefined,
  onTick: () => undefined,
  onLeave: () => undefined,
  onEnd: () => undefined
})

function rentCalls(): unknown[] {
  return api.calls.filter((c) => c.url === '/sports/gear/rent').map((c) => c.body)
}

test('a player with no racket standing in the tennis venue is offered one at the price Laravel gives', async () => {
  const player = await makePlayer(1, INSIDE.x, INSIDE.z)
  const room = await fakeRoom([player])
  api.replies.set('GET /sports/gear', () => json({ gear: [], rental: RENTAL }))
  await onGearQuote(room, clientOf(room, player), NOW)
  assert.deepEqual(sentOf(clientOf(room, player), 'sports_gear_offer'), [{ gear: 'gear_tennis_racket', price: 30 }])
  await onGearQuote(room, clientOf(room, player), NOW + 999)
  assert.equal(sentOf(clientOf(room, player), 'sports_gear_offer').length, 1)
})

test('no offer for an owner, outside a venue that lends gear, or with the gear already on loan', async () => {
  const owner = await makePlayer(2, INSIDE.x, INSIDE.z)
  const outside = await makePlayer(3, TENNIS.maxX + 1, INSIDE.z)
  const room = await fakeRoom([owner, outside])
  api.replies.set('GET /sports/gear', () => json({ gear: ['gear_tennis_racket'], rental: RENTAL }))
  await onGearQuote(room, clientOf(room, owner), NOW)
  await onGearQuote(room, clientOf(room, outside), NOW)
  assert.equal(sentOf(clientOf(room, owner), 'sports_gear_offer').length, 0)
  assert.equal(sentOf(clientOf(room, outside), 'sports_gear_offer').length, 0)
})

test('renting pays Laravel once, lends the gear for the venue and makes it usable; leaving the venue takes it back', async () => {
  const player = await makePlayer(4, INSIDE.x, INSIDE.z)
  player.sportsPassUntil = NOW + 1
  const room = await fakeRoom([player])
  const changed: string[] = []
  onGearChanged((p) => void changed.push(p.sessionId))
  api.calls.length = 0
  api.replies.set('GET /sports/gear', () => json({ gear: [], rental: RENTAL }))
  api.replies.set('POST /sports/gear/rent', () => json({ code: 'gear_tennis_racket', price: 30, cash: 70 }))
  assert.deepEqual(await usableGear(player), [])
  await onGearRent(room, clientOf(room, player))
  assert.equal(rentCalls().length, 1)
  assert.equal((rentCalls()[0] as { code: string }).code, 'gear_tennis_racket')
  assert.deepEqual(sentOf(clientOf(room, player), 'sports_gear_rented'), [{ gear: 'gear_tennis_racket', cash: 70 }])
  assert.equal(hasLoan(player, 'gear_tennis_racket'), true)
  assert.deepEqual(changed, [player.sessionId])
  assert.ok((await usableGear(player)).includes('gear_tennis_racket'))
  await onGearRent(room, clientOf(room, player))
  assert.equal(rentCalls().length, 1)
  assert.equal((sentOf(clientOf(room, player), 'sports_error').at(-1) as { code: string }).code, 'sports_rent_already')
  player.x = TENNIS.maxX + 1
  updateLoansOnMove(room, player, NOW)
  assert.equal(hasLoan(player, 'gear_tennis_racket'), false)
  assert.ok(!(await usableGear(player)).includes('gear_tennis_racket'))
})

test('nothing is lent when Laravel refuses, when the player stands outside the venue, or while another request runs', async () => {
  const broke = await makePlayer(5, INSIDE.x, INSIDE.z)
  const outside = await makePlayer(6, TENNIS.maxX + 1, INSIDE.z)
  const busy = await makePlayer(7, INSIDE.x, INSIDE.z)
  busy.sportsPending = true
  const room = await fakeRoom([broke, outside, busy])
  api.calls.length = 0
  api.replies.set('POST /sports/gear/rent', () => json({ code: 'sports_rent_insufficient_cash', message: 'Lending this gear costs 30 coins in cash.' }, 422))
  await onGearRent(room, clientOf(room, broke))
  await onGearRent(room, clientOf(room, outside))
  await onGearRent(room, clientOf(room, busy))
  assert.equal(rentCalls().length, 1)
  assert.deepEqual([broke, outside, busy].map((p) => (sentOf(clientOf(room, p), 'sports_error').at(-1) as { code: string }).code), ['sports_rent_insufficient_cash', 'sports_rent_too_far', 'sports_busy'])
  assert.deepEqual([broke, outside, busy].map((p) => hasLoan(p, 'gear_tennis_racket')), [false, false, false])
  assert.equal(broke.sportsPending, false)
})
