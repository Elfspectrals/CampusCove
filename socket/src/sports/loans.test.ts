import assert from 'node:assert/strict'
import { test } from 'node:test'
import { clientOf, fakeRoom, installWorld, makePlayer, sentOf } from './testWorld.ts'

installWorld()
const { loadWorld } = await import('../world.ts')
const { hasLoan, lend, sendLoansOnJoin, takeBack, takeBackAll, updateLoansOnMove } = await import('./loans.ts')
const { leaveSportsRoom, moveInSports, sportsDeath } = await import('./index.ts')
const { CLIMBING_SHOES } = await import('./sportsConstants.ts')
await loadWorld()

const NOW = 1_000_000

test('climbing shoes are lent on entering the site with a pass and taken back on leaving it', async () => {
  const player = await makePlayer(1, -350, -120)
  const watcher = await makePlayer(2, 0, 0)
  const room = await fakeRoom([player, watcher])
  updateLoansOnMove(room, player, NOW)
  assert.equal(hasLoan(player, CLIMBING_SHOES), false)
  player.sportsPassUntil = NOW + 1
  updateLoansOnMove(room, player, NOW)
  assert.equal(hasLoan(player, CLIMBING_SHOES), true)
  assert.deepEqual(sentOf(clientOf(room, watcher), 'sports_loans'), [{ sessionId: 's1', loans: [CLIMBING_SHOES] }])
  updateLoansOnMove(room, player, NOW)
  assert.equal(sentOf(clientOf(room, watcher), 'sports_loans').length, 1)
  player.x = -420
  updateLoansOnMove(room, player, NOW)
  assert.equal(hasLoan(player, CLIMBING_SHOES), false)
  assert.deepEqual(sentOf(clientOf(room, watcher), 'sports_loans').at(-1), { sessionId: 's1', loans: [] })
})

test('a venue loan is taken back when the player leaves that venue area, not the site', async () => {
  const player = await makePlayer(3, -370, -170)
  player.sportsPassUntil = NOW + 1
  const room = await fakeRoom([player])
  assert.equal(lend(room, player, 'football', 'sports_gym'), true)
  assert.equal(lend(room, player, 'football', 'sports_gym'), false)
  updateLoansOnMove(room, player, NOW)
  assert.deepEqual([...player.sportsLoans.keys()], ['football', CLIMBING_SHOES])
  player.x = -350
  player.z = -120
  updateLoansOnMove(room, player, NOW)
  assert.deepEqual([...player.sportsLoans.keys()], [CLIMBING_SHOES])
})

test('lending in an area that is not a pass area is a programming error', async () => {
  const player = await makePlayer(4, -370, -170)
  const room = await fakeRoom([player])
  assert.throws(() => lend(room, player, 'football', 'sports_road'), /not a sports pass area/)
})

test('takeBack and takeBackAll broadcast only real changes', async () => {
  const player = await makePlayer(5, -370, -170)
  const room = await fakeRoom([player])
  const client = clientOf(room, player)
  assert.equal(takeBack(room, player, 'football'), false)
  takeBackAll(room, player)
  assert.equal(sentOf(client, 'sports_loans').length, 0)
  lend(room, player, 'football', 'sports_gym')
  lend(room, player, 'bib', 'sports_gym')
  assert.equal(takeBack(room, player, 'bib'), true)
  takeBackAll(room, player)
  assert.deepEqual(sentOf(client, 'sports_loans').at(-1), { sessionId: 's5', loans: [] })
})

test('death and disconnect take every loan back', async () => {
  const player = await makePlayer(6, -370, -170)
  const other = await makePlayer(7, -370, -171)
  const room = await fakeRoom([player, other])
  lend(room, player, 'football', 'sports_gym')
  sportsDeath(room, player)
  assert.equal(player.sportsLoans.size, 0)
  lend(room, other, 'football', 'sports_gym')
  room.players.delete(other.sessionId)
  leaveSportsRoom(room, other, NOW)
  assert.equal(other.sportsLoans.size, 0)
  assert.deepEqual(sentOf(clientOf(room, player), 'sports_loans').at(-1), { sessionId: 's7', loans: [] })
})

test('a joining player is told every loan already out, and moveInSports updates loans', async () => {
  const lender = await makePlayer(8, -350, -120)
  lender.sportsPassUntil = NOW + 1
  const newcomer = await makePlayer(9, 0, 0)
  const room = await fakeRoom([lender, newcomer])
  moveInSports(room, lender, NOW)
  const client = clientOf(room, newcomer)
  client.sent.length = 0
  sendLoansOnJoin(room, client)
  assert.deepEqual(sentOf(client, 'sports_loans'), [{ sessionId: 's8', loans: [CLIMBING_SHOES] }])
})
