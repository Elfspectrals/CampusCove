import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DESK, api, clientOf, fakeRoom, installWorld, json, makePlayer, sentOf } from './testWorld.ts'

installWorld()
const { loadSportsPassDesk, loadWorld, parseSportsPassAreas, parseSportsPassDesk, worldSportsPassAreas, worldSportsPassDesk } = await import('../world.ts')
const { moveRejection } = await import('../movement.ts')
const { entersPassAreaWithoutPass, loadSportsPass, onSportsPassBuy, parseSportsPass } = await import('./pass.ts')
await loadWorld()
await loadSportsPassDesk()

const PASS = { validUntil: '2026-11-15T12:00:00Z', prices: { day: 40, week: 200 } }
const UNTIL = Date.parse(PASS.validUntil)

test('manifest zones flagged sportsPass are the pass areas, and a bad flag throws', () => {
  assert.deepEqual([...worldSportsPassAreas().keys()], ['sports_complex', 'sports_gym'])
  assert.equal(parseSportsPassAreas([{ key: 'a', bounds: { minX: 0, maxX: 1, minZ: 0, maxZ: 1 } }]).size, 0)
  assert.throws(() => parseSportsPassAreas([{ key: 'a', sportsPass: 'yes' }]), /sportsPass/)
  assert.throws(() => parseSportsPassAreas([{ key: 'a', sportsPass: true }]), /bounds/)
})

test('the pass desk is the reception prop with sportsPassDesk', () => {
  assert.deepEqual(worldSportsPassDesk(), DESK)
  assert.equal(parseSportsPassDesk({ props: [] }), null)
  assert.throws(() => parseSportsPassDesk({}), /missing props/)
  assert.throws(() => parseSportsPassDesk({ props: [{ sportsPassDesk: true, position: [0, 'a', 0] }] }), /invalid position/)
  assert.throws(() => parseSportsPassDesk({ props: [{ sportsPassDesk: true, position: [0, 0, 0] }, { sportsPassDesk: true, position: [1, 0, 0] }] }), /expected one/)
})

test('without a sports_reception zone the desk is closed and nothing throws', async () => {
  api.files.set('zones/index.json', { zones: [] })
  await loadSportsPassDesk()
  assert.equal(worldSportsPassDesk(), null)
  api.files.set('zones/index.json', { zones: ['sports_reception'] })
  await loadSportsPassDesk()
  assert.deepEqual(worldSportsPassDesk(), DESK)
})

test('the API pass is parsed to milliseconds and malformed answers throw', () => {
  assert.deepEqual(parseSportsPass(PASS), { validUntil: UNTIL, prices: { day: 40, week: 200 } })
  assert.equal(parseSportsPass({ ...PASS, validUntil: null }).validUntil, null)
  assert.throws(() => parseSportsPass({ ...PASS, validUntil: 'soon' }))
  assert.throws(() => parseSportsPass({ validUntil: null, prices: { day: 40 } }))
})

test('entering a pass area needs a valid pass, leaving and moving inside never do', async () => {
  const player = await makePlayer(1, -401, -120)
  const room = await fakeRoom([player])
  const now = UNTIL - 1000
  assert.equal(moveRejection(room, player, -399, 1.6, -120, now), 'no_pass')
  player.sportsPassUntil = UNTIL
  assert.equal(moveRejection(room, player, -399, 1.6, -120, now), null)
  assert.equal(entersPassAreaWithoutPass(player, -399, -120, UNTIL), true)
  player.x = -399
  assert.equal(entersPassAreaWithoutPass(player, -398, -120, UNTIL), false)
  assert.equal(entersPassAreaWithoutPass(player, -420, -120, UNTIL), false)
  assert.equal(entersPassAreaWithoutPass(player, -350, -120, UNTIL), false)
  player.x = -381
  player.z = -170
  assert.equal(entersPassAreaWithoutPass(player, -379, -170, UNTIL), true)
})

test('the pass is loaded at join and sent to the player', async () => {
  const player = await makePlayer(2, 0, 0)
  const room = await fakeRoom([player])
  api.replies.set('GET /sports/pass', () => json({ pass: PASS }))
  await loadSportsPass(room, clientOf(room, player), player)
  assert.equal(player.sportsPassUntil, UNTIL)
  assert.deepEqual(sentOf(clientOf(room, player), 'sports_pass_state'), [{ validUntil: UNTIL, prices: { day: 40, week: 200 } }])
})

test('a purchase at the desk sends a fresh ref each time and the new state with the cash', async () => {
  const player = await makePlayer(3, DESK.x + 2, DESK.z)
  const room = await fakeRoom([player])
  const client = clientOf(room, player)
  api.calls.length = 0
  api.replies.set('POST /sports/pass', () => json({ pass: PASS, cash: 160 }))
  await onSportsPassBuy(room, client, { kind: 'day' }, 10_000)
  await onSportsPassBuy(room, client, { kind: 'week' }, 20_000)
  const posts = api.calls.filter((c) => c.method === 'POST')
  assert.equal(posts.length, 2)
  const [first, second] = posts.map((c) => c.body as { kind: string, ref: string })
  assert.equal(first.kind, 'day')
  assert.equal(second.kind, 'week')
  assert.notEqual(first.ref, second.ref)
  assert.ok(first.ref.length >= 1 && first.ref.length <= 64)
  assert.equal(player.sportsPassUntil, UNTIL)
  assert.deepEqual(sentOf(client, 'sports_pass_bought').at(-1), { validUntil: UNTIL, cash: 160 })
  assert.deepEqual(client.sent.slice(-2).map((m) => m.type), ['sports_pass_bought', 'sports_pass_state'])
  assert.deepEqual(sentOf(client, 'sports_pass_state').at(-1), { validUntil: UNTIL, prices: { day: 40, week: 200 } })
})

test('a purchase is ignored away from the desk, with a bad kind or inside the cooldown', async () => {
  const player = await makePlayer(4, DESK.x + 4, DESK.z)
  const room = await fakeRoom([player])
  const client = clientOf(room, player)
  api.calls.length = 0
  await onSportsPassBuy(room, client, { kind: 'day' }, 10_000)
  player.x = DESK.x
  await onSportsPassBuy(room, client, { kind: 'month' }, 20_000)
  await onSportsPassBuy(room, client, { kind: 'day' }, 30_000)
  await onSportsPassBuy(room, client, { kind: 'day' }, 30_100)
  assert.equal(api.calls.filter((c) => c.method === 'POST').length, 1)
})

test('an API refusal is sent back as sports_pass_error', async () => {
  const player = await makePlayer(5, DESK.x, DESK.z)
  const room = await fakeRoom([player])
  const client = clientOf(room, player)
  api.replies.set('POST /sports/pass', () => json({ code: 'sports_pass_cap', message: 'Too far ahead.' }, 422))
  await onSportsPassBuy(room, client, { kind: 'week' }, 10_000)
  assert.deepEqual(sentOf(client, 'sports_pass_error'), [{ code: 'sports_pass_cap', message: 'Too far ahead.' }])
  assert.equal(player.sportsPassPending, false)
  assert.equal(player.sportsPassUntil, null)
})
