import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  TRADE_BREAK_DISTANCE,
  type Trade,
  type TradeBackend,
  type TradeRoom,
  checkTradeDistance,
  nearbyTraders,
  onTradeCancel,
  onTradeConfirm,
  onTradeLeave,
  onTradeOffer,
  onTradeRequest,
  onTradeRespond,
  parseOffer
} from './trade.ts'
import type { ClientPayload, Player } from './types.ts'

interface Sent { type: string, payload: any }
type FakeClient = ReturnType<typeof fakeClient>

function fakeClient(sessionId: string) {
  const sent: Sent[] = []
  return { sessionId, sent, send: (type: string, payload?: unknown) => void sent.push({ type, payload }) }
}

function fakePlayer(sessionId: string, accountId: number, x: number, z = 0): Player {
  return { sessionId, accountId, pseudo: sessionId.toUpperCase(), token: `token-${sessionId}`, x, y: 1.6, z, tradeId: null, lastTradeRequestAt: 0 } as Player
}

function fakeRoom(...players: Player[]): TradeRoom & { clients: FakeClient[] } {
  return {
    players: new Map(players.map((p) => [p.sessionId, p])),
    clients: players.map((p) => fakeClient(p.sessionId)),
    housingUnits: [],
    trades: new Map<string, Trade>(),
    clock: { setTimeout: () => undefined }
  }
}

const OFFERABLE: Record<string, unknown> = {
  'token-a': { coins: 300, items: [{ code: 'food_sandwich', name: 'Sandwich', kind: 'consumable', quantity: 3, preview_image: '/s.png' }] },
  'token-b': { coins: 20, items: [{ code: 'COS_WEAR_TOP_TEE', name: 'Classic Tee', kind: 'cosmetic', quantity: 1, preview_image: null }] }
}

function fakeBackend(execute: TradeBackend['execute'] = async () => ({ my_coins: 1, partner_coins: 2 })) {
  const calls: Array<{ token: string | null, path: string, body: any }> = []
  const backend: TradeBackend = {
    fetch: async (token) => OFFERABLE[token ?? ''],
    execute: async (token, path, method, body) => {
      calls.push({ token, path, body })
      return execute(token, path, method, body)
    }
  }
  return { backend, calls }
}

function received(client: FakeClient, type: string) {
  return client.sent.filter((m) => m.type === type).map((m) => m.payload)
}

function lastState(client: FakeClient) {
  return received(client, 'trade_state').at(-1)
}

/** Two players 2 m apart with an open trade. */
function openTrade() {
  const a = fakePlayer('a', 1, 0)
  const b = fakePlayer('b', 2, 2)
  const room = fakeRoom(a, b)
  const [ca, cb] = room.clients
  onTradeRequest(room, ca, { targetSessionId: 'b' })
  onTradeRespond(room, cb, { accept: true })
  return { room, a, b, ca, cb, trade: [...room.trades.values()][0] }
}

let clockMs = 10_000
const offer = (room: TradeRoom, client: FakeClient, payload: ClientPayload, backend: TradeBackend) =>
  onTradeOffer(room, client, payload, backend, (clockMs += 1000))

test('the Trade app lists nearby players, nearest first, with reach and busy flags', () => {
  const me = fakePlayer('me', 1, 0)
  const near = fakePlayer('near', 2, 3)
  const mid = fakePlayer('mid', 3, 8)
  const far = fakePlayer('far', 4, 40)
  const twin = fakePlayer('twin', 1, 1)
  mid.tradeId = 'other'
  const room = fakeRoom(me, near, mid, far, twin)

  assert.deepEqual(nearbyTraders(room, me), [
    { sessionId: 'near', pseudo: 'NEAR', distance: 3, inReach: true, busy: false },
    { sessionId: 'mid', pseudo: 'MID', distance: 8, inReach: false, busy: true }
  ])
})

test('a request needs another player, in reach, not already trading', () => {
  const a = fakePlayer('a', 1, 0)
  const b = fakePlayer('b', 2, 10)
  const room = fakeRoom(a, b)
  const [ca, cb] = room.clients

  onTradeRequest(room, ca, { targetSessionId: 'a' })
  onTradeRequest(room, ca, { targetSessionId: 'b' })
  assert.deepEqual(received(ca, 'trade_error').map((e) => e.code), ['trade_invalid_target', 'trade_too_far'])
  assert.equal(room.trades.size, 0)

  b.x = 0
  b.z = 3
  onTradeRequest(room, ca, { targetSessionId: 'b' })
  assert.equal(room.trades.size, 1)
  assert.equal(a.tradeId, b.tradeId)
  assert.deepEqual(received(cb, 'trade_requested'), [{ tradeId: a.tradeId, fromSessionId: 'a', fromPseudo: 'A' }])
})

test('declining closes the request for both players', () => {
  const a = fakePlayer('a', 1, 0)
  const b = fakePlayer('b', 2, 2)
  const room = fakeRoom(a, b)
  const [ca, cb] = room.clients
  onTradeRequest(room, ca, { targetSessionId: 'b' })
  // the requester cannot accept their own request
  onTradeRespond(room, ca, { accept: true })
  assert.equal([...room.trades.values()][0]?.status, 'requested')

  onTradeRespond(room, cb, { accept: false })
  assert.equal(room.trades.size, 0)
  assert.equal(a.tradeId, null)
  assert.equal(received(ca, 'trade_closed')[0].reason, 'declined')
  assert.equal(received(cb, 'trade_closed')[0].reason, 'declined')
})

test('offers are checked against the API inventory and every change resets both confirmations', async () => {
  const { room, ca, cb, trade } = openTrade()
  const { backend } = fakeBackend()
  assert.equal(lastState(cb).status, 'open')

  await offer(room, ca, { coins: 50, items: [{ code: 'food_sandwich', quantity: 2 }] }, backend)
  assert.deepEqual(lastState(cb).partner.offer, {
    coins: 50,
    items: [{ code: 'food_sandwich', name: 'Sandwich', kind: 'consumable', quantity: 2, previewImage: '/s.png' }]
  })

  await onTradeConfirm(room, cb, { revision: trade.revision }, backend)
  assert.equal(lastState(ca).partner.confirmed, true)

  await offer(room, ca, { coins: 60, items: [{ code: 'food_sandwich', quantity: 2 }] }, backend)
  assert.equal(lastState(ca).partner.confirmed, false)
  assert.equal(lastState(cb).me.confirmed, false)

  await offer(room, ca, { coins: 301 }, backend)
  await offer(room, ca, { items: [{ code: 'COS_WEAR_BODY_NEON_RONIN', quantity: 1 }] }, backend)
  await offer(room, ca, { items: [{ code: 'food_sandwich', quantity: 4 }] }, backend)
  assert.deepEqual(received(ca, 'trade_error').map((e) => e.message), [
    'You do not have that many coins.',
    'This item cannot be traded.',
    'You do not have that many Sandwich.'
  ])
  assert.equal(lastState(cb).partner.offer.coins, 60, 'a refused offer keeps the previous one')
})

test('both confirmations on the same revision execute the trade once', async () => {
  const { room, a, b, ca, cb, trade } = openTrade()
  const { backend, calls } = fakeBackend()
  await offer(room, ca, { coins: 100 }, backend)
  await offer(room, cb, { items: [{ code: 'COS_WEAR_TOP_TEE', quantity: 1 }] }, backend)

  // a confirmation for an older revision does not count
  await onTradeConfirm(room, ca, { revision: trade.revision - 1 }, backend)
  assert.equal(lastState(cb).partner.confirmed, false)

  await onTradeConfirm(room, ca, { revision: trade.revision }, backend)
  const pending = onTradeConfirm(room, cb, { revision: trade.revision }, backend)
  // a second confirm while the API call runs is ignored
  await onTradeConfirm(room, ca, { revision: trade.revision }, backend)
  await pending

  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    token: 'token-a',
    path: '/trades/execute',
    body: {
      partner_account_id: 2,
      trade_ref: trade.id,
      my_offer: { coins: 100, items: [] },
      partner_offer: { coins: 0, items: [{ code: 'COS_WEAR_TOP_TEE', quantity: 1 }] }
    }
  })
  assert.equal(received(ca, 'trade_completed')[0].coins, 1)
  assert.equal(received(ca, 'trade_completed')[0].received.items[0].code, 'COS_WEAR_TOP_TEE')
  assert.equal(received(cb, 'trade_completed')[0].coins, 2)
  assert.equal(received(cb, 'trade_completed')[0].received.coins, 100)
  assert.equal(room.trades.size, 0)
  assert.equal(a.tradeId, null)
  assert.equal(b.tradeId, null)
})

test('a refused execution reopens the trade with both confirmations reset', async () => {
  const { room, ca, cb, trade } = openTrade()
  const { backend } = fakeBackend(async () => {
    throw Object.assign(new Error('One of you no longer has enough coins.'), { code: 'trade_insufficient_coins' })
  })
  await offer(room, ca, { coins: 100 }, backend)
  await onTradeConfirm(room, ca, { revision: trade.revision }, backend)
  await onTradeConfirm(room, cb, { revision: trade.revision }, backend)

  assert.equal(trade.status, 'open')
  assert.equal(lastState(ca).me.confirmed, false)
  assert.equal(lastState(ca).partner.confirmed, false)
  for (const client of [ca, cb]) {
    assert.deepEqual(received(client, 'trade_error').at(-1), { message: 'One of you no longer has enough coins.', code: 'trade_insufficient_coins' })
  }
})

test('walking away, leaving or cancelling closes the trade for both', () => {
  const far = openTrade()
  far.b.x = TRADE_BREAK_DISTANCE + 1
  checkTradeDistance(far.room, far.b)
  assert.equal(received(far.ca, 'trade_closed')[0].reason, 'too_far')
  assert.equal(far.a.tradeId, null)

  const left = openTrade()
  onTradeLeave(left.room, left.b)
  assert.equal(received(left.ca, 'trade_closed')[0].reason, 'left')

  const cancelled = openTrade()
  onTradeCancel(cancelled.room, cancelled.cb, { tradeId: cancelled.trade.id })
  assert.deepEqual(received(cancelled.ca, 'trade_closed')[0], { tradeId: cancelled.trade.id, reason: 'cancelled', byMe: false })
  assert.equal(received(cancelled.cb, 'trade_closed')[0].byMe, true)
})

test('malformed offers are rejected', () => {
  assert.equal(parseOffer({ coins: -1 }), null)
  assert.equal(parseOffer({ coins: 1.5 }), null)
  assert.equal(parseOffer({ coins: 2_000_000 }), null)
  assert.equal(parseOffer({ items: [{ code: 'x; drop', quantity: 1 }] }), null)
  assert.equal(parseOffer({ items: [{ code: 'food_sandwich', quantity: 0 }] }), null)
  assert.equal(parseOffer({ items: 'all' }), null)
  assert.deepEqual(parseOffer({ coins: 5, items: [{ code: 'a', quantity: 1 }, { code: 'a', quantity: 2 }] }), { coins: 5, items: new Map([['a', 3]]) })
})
