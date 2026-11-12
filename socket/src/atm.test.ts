import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { GameClient, GameRoom, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = GameClient & { sent: Sent[] }

process.env.WORLD_MANIFEST_URL = 'http://world.test/world.manifest.json'

const manifest = { spawn: [0, 1.6, 13], bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, zones: [{ key: 'town', buildings: [] }] }
const zoneIndex = { version: 1, zones: ['work_district'] }
const workZone = { version: 1, zone: 'work_district', name: 'Work', props: [{ id: 'atm_town', kind: 'item', key: 'atm', code: 'decor_atm', forSale: false, position: [7, 0, 10] }], areas: [] }

const apiCalls: Array<{ path: string, body: any }> = []
let nextApiError: { status: number, code: string, message: string } | null = null

globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
  const path = String(url)
  if (path === process.env.WORLD_MANIFEST_URL) return new Response(JSON.stringify(manifest))
  if (path === 'http://world.test/zones/index.json') return new Response(JSON.stringify(zoneIndex))
  if (path === 'http://world.test/zones/work_district.json') return new Response(JSON.stringify(workZone))
  apiCalls.push({ path: path.replace(/^.*\/api/, ''), body: init?.body ? JSON.parse(String(init.body)) : null })
  if (nextApiError) {
    const { status, code, message } = nextApiError
    nextApiError = null
    return new Response(JSON.stringify({ code, message }), { status })
  }
  return new Response(JSON.stringify({ cash: 120, bank: 380 }))
}

const { loadWorld, loadAtms } = await import('./world.ts')
const { ATM_COOLDOWN_MS, ATM_REACH, onAtm } = await import('./atm.ts')
await loadWorld()
await loadAtms()

function setup(x: number, z: number) {
  const player = { sessionId: 's1', accountId: 42, token: 'token-s1', x, y: 1.6, z, knockedOutUntil: 0, lastAtmAt: 0 } as unknown as Player
  const room = { players: new Map([['s1', player]]) } as unknown as GameRoom
  const sent: Sent[] = []
  const client: FakeClient = { sessionId: 's1', sent, send: (type, payload) => void sent.push({ type, payload }) } as FakeClient
  apiCalls.length = 0
  return { room, client, player }
}

test('a withdrawal at the ATM goes to the bank API with a ref scoped to the account', async () => {
  const { room, client } = setup(7, 10 + ATM_REACH)
  await onAtm(room, client, { action: 'withdraw', amount: 100, ref: 'abcd-1234', request: 3 }, 10_000)
  assert.deepEqual(apiCalls, [{ path: '/bank/withdraw', body: { ref: '42-abcd-1234', amount: 100 } }])
  assert.deepEqual(client.sent, [{ type: 'atm_done', payload: { action: 'withdraw', cash: 120, bank: 380, request: 3 } }])
})

test('a player just past the reach is refused without calling the API', async () => {
  const { room, client } = setup(7, 10 + ATM_REACH + 0.01)
  await onAtm(room, client, { action: 'deposit', amount: 10, ref: 'abcd-1234' }, 10_000)
  assert.equal(apiCalls.length, 0)
  assert.equal(client.sent[0].payload.code, 'atm_too_far')
})

test('a transfer passes the recipient name and tag', async () => {
  const { room, client } = setup(7, 10)
  await onAtm(room, client, { action: 'transfer', amount: 5, ref: 'abcd-5678', username: ' Bob ', tag: 420 }, 10_000)
  assert.deepEqual(apiCalls[0], { path: '/bank/transfer', body: { ref: '42-abcd-5678', amount: 5, username: 'Bob', tag: 420 } })
})

test('a bad action, amount, ref or recipient is refused', async () => {
  for (const payload of [
    { action: 'steal', amount: 5, ref: 'abcd-1234' },
    { action: 'withdraw', amount: 0, ref: 'abcd-1234' },
    { action: 'withdraw', amount: 2.5, ref: 'abcd-1234' },
    { action: 'withdraw', amount: 1_000_001, ref: 'abcd-1234' },
    { action: 'withdraw', amount: 5, ref: 'x' },
    { action: 'transfer', amount: 5, ref: 'abcd-1234', username: 'Bob', tag: 10_000 }
  ]) {
    const { room, client } = setup(7, 10)
    await onAtm(room, client, payload, 10_000)
    assert.equal(client.sent[0].payload.code, 'atm_bad_request', JSON.stringify(payload))
  }
  assert.equal(apiCalls.length, 0)
})

test('a second operation inside the cooldown is refused, at the cooldown it goes through', async () => {
  const { room, client } = setup(7, 10)
  await onAtm(room, client, { action: 'withdraw', amount: 1, ref: 'abcd-0001' }, 10_000)
  await onAtm(room, client, { action: 'withdraw', amount: 1, ref: 'abcd-0002' }, 10_000 + ATM_COOLDOWN_MS - 1)
  await onAtm(room, client, { action: 'withdraw', amount: 1, ref: 'abcd-0003' }, 10_000 + ATM_COOLDOWN_MS)
  assert.deepEqual(client.sent.map((m) => m.type), ['atm_done', 'atm_error', 'atm_done'])
})

test('a refusal from the bank reaches the player with its code', async () => {
  const { room, client } = setup(7, 10)
  nextApiError = { status: 422, code: 'bank_insufficient_funds', message: 'Not enough money in the bank.' }
  await onAtm(room, client, { action: 'withdraw', amount: 999, ref: 'abcd-1234', request: 9 }, 10_000)
  assert.deepEqual(client.sent, [{ type: 'atm_error', payload: { message: 'Not enough money in the bank.', code: 'bank_insufficient_funds', request: 9 } }])
})
