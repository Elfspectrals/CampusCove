import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { CashBag, GameClient, GameRoom, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }

const apiCalls: string[] = []
let nextApiError: { status: number, code: string, message: string } | null = null
globalThis.fetch = async (url: string | URL | Request) => {
  apiCalls.push(String(url).replace(/^.*\/api/, ''))
  if (nextApiError) {
    const { status, code, message } = nextApiError
    nextApiError = null
    return new Response(JSON.stringify({ code, message }), { status })
  }
  return new Response(JSON.stringify({ amount: 240, cash: 250 }))
}

const { CASH_BAG_REACH, dropCashBag, onCashBagPick } = await import('./cashBags.ts')

function setup() {
  const timers: Array<{ run: () => void, ms: number }> = []
  const players = new Map<string, Player>()
  const clients: FakeClient[] = []
  const room = {
    players,
    cashBags: new Map<number, CashBag>(),
    clients,
    clock: { setTimeout: (run: () => void, ms: number) => timers.push({ run, ms }) },
    forEachClient: (fn: (c: GameClient) => void) => clients.forEach(fn)
  } as unknown as GameRoom
  const join = (sessionId: string, x: number, z: number) => {
    const player = { sessionId, token: `token-${sessionId}`, x, y: 1.6, z, knockedOutUntil: 0, lastCashBagPickAt: 0 } as unknown as Player
    const sent: Sent[] = []
    const client = { sessionId, sent, send: (type: string, payload: unknown) => void sent.push({ type, payload }) } as FakeClient
    players.set(sessionId, player)
    clients.push(client)
    return client
  }
  apiCalls.length = 0
  return { room, timers, join }
}

const drop = (id: number, inMs = 300_000) => ({ id, amount: 240, expires_at: new Date(Date.now() + inMs).toISOString() })

test('a drop appears where the player died, for everyone, and is removed when it expires', () => {
  const { room, timers, join } = setup()
  const watcher = join('w', 50, 50)
  dropCashBag(room, { x: 3, y: 1.6, z: 4 }, drop(7))
  assert.deepEqual(watcher.sent[0].type, 'cash_bag_dropped')
  assert.deepEqual({ ...watcher.sent[0].payload, expiresAt: 0 }, { id: 7, x: 3, y: 1.6, z: 4, expiresAt: 0 })
  assert.ok(Math.abs(timers[0].ms - 300_000) < 1000)
  timers[0].run()
  assert.equal(room.cashBags.size, 0)
  assert.deepEqual(watcher.sent[1], { type: 'cash_bag_removed', payload: { id: 7 } })
})

test('no drop from the API leaves no bag', () => {
  const { room, join } = setup()
  const watcher = join('w', 0, 0)
  dropCashBag(room, { x: 0, y: 1.6, z: 0 }, null)
  assert.equal(room.cashBags.size, 0)
  assert.equal(watcher.sent.length, 0)
})

test('a player within reach picks up the bag through the API and everyone sees it go', async () => {
  const { room, join } = setup()
  const finder = join('f', 3 + CASH_BAG_REACH, 4)
  const watcher = join('w', 50, 50)
  dropCashBag(room, { x: 3, y: 1.6, z: 4 }, drop(7))
  await onCashBagPick(room, finder, { id: 7 }, 10_000)
  assert.deepEqual(apiCalls, ['/cash-drops/7/pick'])
  assert.deepEqual(finder.sent.at(-1), { type: 'cash_bag_picked', payload: { id: 7, amount: 240, cash: 250 } })
  assert.deepEqual(watcher.sent.at(-1), { type: 'cash_bag_removed', payload: { id: 7 } })
})

test('a player just past the reach is refused without calling the API', async () => {
  const { room, join } = setup()
  const finder = join('f', 3 + CASH_BAG_REACH + 0.01, 4)
  dropCashBag(room, { x: 3, y: 1.6, z: 4 }, drop(7))
  await onCashBagPick(room, finder, { id: 7 }, 10_000)
  assert.equal(apiCalls.length, 0)
  assert.equal(finder.sent.at(-1)?.payload.code, 'cash_bag_too_far')
})

test('the killer is refused by the API and the bag stays on the ground', async () => {
  const { room, join } = setup()
  const killer = join('k', 3, 4)
  dropCashBag(room, { x: 3, y: 1.6, z: 4 }, drop(7))
  nextApiError = { status: 403, code: 'cash_drop_killer', message: 'You cannot take the cash of the player you knocked out.' }
  await onCashBagPick(room, killer, { id: 7 }, 10_000)
  assert.equal(killer.sent.at(-1)?.payload.code, 'cash_drop_killer')
  assert.equal(room.cashBags.size, 1)
})

test('a bag already taken on the API side is removed for everyone', async () => {
  const { room, join } = setup()
  const late = join('l', 3, 4)
  dropCashBag(room, { x: 3, y: 1.6, z: 4 }, drop(7))
  nextApiError = { status: 409, code: 'cash_drop_gone', message: 'This cash is gone.' }
  await onCashBagPick(room, late, { id: 7 }, 10_000)
  assert.equal(room.cashBags.size, 0)
  assert.deepEqual(late.sent.map((m) => m.type).slice(-2), ['cash_bag_removed', 'cash_bag_error'])
})
