import { callRealtimeBackend, errorPayload } from './backend.ts'
import type { ClientPayload, GameClient, GameRoom } from './types.ts'
import { worldBuyer, worldZoneBounds } from './world.ts'

/** Same caps as Laravel's ShopCheckoutRequest (docs/SHOP_CART.md). */
const MAX_BASKET_LINES = 50
const MAX_LINE_QUANTITY = 20
const MAX_SALE = 999
const BUYER_REACH = 3
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface BasketLine { id: number, quantity: number }

function sendZoneCheckoutError(client: GameClient, request: number | null, message: string, code: string): void {
  client.send('zone_checkout_error', { message, code, request })
}

function isPositiveInt(value: unknown, max = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= max
}

function validBasket(items: unknown): items is BasketLine[] {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_BASKET_LINES) return false
  const ids = new Set<number>()
  for (const line of items) {
    if (typeof line !== 'object' || line === null) return false
    const { id, quantity } = line as Record<string, unknown>
    if (!isPositiveInt(id) || !isPositiveInt(quantity, MAX_LINE_QUANTITY) || ids.has(id)) return false
    ids.add(id)
  }
  return true
}

export async function onZoneCheckout(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const raw = payload?.request
  const request = Number.isSafeInteger(raw) ? raw as number : null
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil) {
    sendZoneCheckoutError(client, request, 'You cannot pay right now.', 'zone_cannot_pay')
    return
  }
  const zone = payload?.zone
  const items = payload?.items
  const checkoutKey = payload?.checkoutKey
  if (typeof zone !== 'string' || typeof checkoutKey !== 'string' || !UUID.test(checkoutKey) || !validBasket(items)) {
    sendZoneCheckoutError(client, request, 'Your basket is not valid.', 'zone_bad_basket')
    return
  }
  const bounds = worldZoneBounds(zone)
  if (!bounds) {
    sendZoneCheckoutError(client, request, 'Nothing is sold here.', 'zone_unknown')
    return
  }
  if (player.x < bounds.minX || player.x > bounds.maxX || player.z < bounds.minZ || player.z > bounds.maxZ) {
    sendZoneCheckoutError(client, request, 'Walk back into the shop to pay.', 'zone_too_far')
    return
  }
  const lines = items.map(({ id, quantity }) => ({ shop_catalog_item_id: id, quantity }))
  try {
    client.send('zone_checkout_done', { ...await callRealtimeBackend(player.token, '/zone/checkout', 'POST', { zone, checkout_key: checkoutKey, items: lines }), request })
  } catch (error) {
    console.warn('[zone shop] checkout failed:', error instanceof Error ? error.message : error)
    client.send('zone_checkout_error', { ...errorPayload(error, 'The cashier could not take your payment.', 'zone_checkout_failed'), request })
  }
}

function sendZoneSellError(client: GameClient, message: string, code: string): void {
  client.send('zone_sell_error', { message, code })
}

export async function onZoneSell(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil) {
    sendZoneSellError(client, 'You cannot sell right now.', 'zone_cannot_sell')
    return
  }
  const { zone, area, code, quantity } = payload ?? {}
  if (typeof zone !== 'string' || typeof area !== 'string' || typeof code !== 'string' || typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_SALE) {
    sendZoneSellError(client, 'Choose what to sell and how many.', 'zone_bad_sale')
    return
  }
  try {
    const buyer = await worldBuyer(zone, area)
    if (!buyer) {
      sendZoneSellError(client, 'Nobody buys anything here.', 'zone_unknown_buyer')
      return
    }
    if (Math.hypot(player.x - buyer.x, player.z - buyer.z) > BUYER_REACH) {
      sendZoneSellError(client, 'Walk up to the buyer.', 'zone_too_far')
      return
    }
    client.send('zone_sold', await callRealtimeBackend(player.token, '/zone/sell', 'POST', { zone, area, code, quantity }))
  } catch (error) {
    console.warn('[zone shop] sale failed:', error instanceof Error ? error.message : error)
    client.send('zone_sell_error', errorPayload(error, 'The buyer could not take your goods.', 'zone_sell_failed'))
  }
}
