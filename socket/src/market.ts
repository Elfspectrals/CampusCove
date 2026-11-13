import { callBackendJson, callRealtimeBackend, errorPayload } from './backend.ts'
import type { ClientPayload, GameClient, GameRoom, MarketSnapshot, MarketStallView, Player } from './types.ts'
import { worldMarketStall } from './world.ts'

export const STALL_REACH = 3
export const MARKET_COOLDOWN_MS = 500
export const MARKET_STALLS = 6
export const LOTS_PER_STALL = 6
export const MAX_LOT_QUANTITY = 999
export const MAX_UNIT_PRICE = 1_000_000
const BOUNDARY_DELAY_MS = 1000
const REF = /^[A-Za-z0-9-]{8,40}$/
const CODE = /^[A-Za-z0-9_]{1,64}$/

export type MarketIntent =
  | { action: 'claim', stallNo: number, canopy: string }
  | { action: 'list', slot: number, code: string, quantity: number, unitPrice: number }
  | { action: 'withdraw', lotId: number }
  | { action: 'buy', lotId: number, quantity: number, ref: string }

function intIn(raw: unknown, min: number, max: number): number | null {
  return Number.isInteger(raw) && (raw as number) >= min && (raw as number) <= max ? raw as number : null
}

function stringMatching(raw: unknown, pattern: RegExp): string | null {
  return typeof raw === 'string' && pattern.test(raw) ? raw : null
}

export function parseMarketIntent(payload: ClientPayload): MarketIntent | null {
  const lotId = intIn(payload?.lotId, 1, Number.MAX_SAFE_INTEGER)
  const quantity = intIn(payload?.quantity, 1, MAX_LOT_QUANTITY)
  switch (payload?.action) {
    case 'claim': {
      const stallNo = intIn(payload.stallNo, 1, MARKET_STALLS)
      const canopy = stringMatching(payload.canopy, /^[a-z]{1,10}$/)
      return stallNo !== null && canopy !== null ? { action: 'claim', stallNo, canopy } : null
    }
    case 'list': {
      const slot = intIn(payload.slot, 1, LOTS_PER_STALL)
      const code = stringMatching(payload.code, CODE)
      const unitPrice = intIn(payload.unitPrice, 1, MAX_UNIT_PRICE)
      return slot !== null && code !== null && quantity !== null && unitPrice !== null
        ? { action: 'list', slot, code, quantity, unitPrice }
        : null
    }
    case 'withdraw':
      return lotId !== null ? { action: 'withdraw', lotId } : null
    case 'buy': {
      const ref = stringMatching(payload.ref, REF)
      return lotId !== null && quantity !== null && ref !== null ? { action: 'buy', lotId, quantity, ref } : null
    }
    default:
      return null
  }
}

export function stallInReach(stallNo: number, player: Pick<Player, 'x' | 'z'>): boolean {
  const stall = worldMarketStall(stallNo)
  return stall !== null && Math.hypot(stall.x - player.x, stall.z - player.z) <= STALL_REACH
}

function stallOfLot(market: MarketSnapshot, lotId: number): MarketStallView | null {
  return market.stalls.find((stall) => stall.lots.some((lot) => lot.lot_id === lotId)) ?? null
}

function targetStall(market: MarketSnapshot, player: Player, intent: MarketIntent): number | null {
  switch (intent.action) {
    case 'claim':
      return intent.stallNo
    case 'list':
      return market.stalls.find((stall) => stall.account_id === player.accountId)?.stall_no ?? null
    default:
      return stallOfLot(market, intent.lotId)?.stall_no ?? null
  }
}

function backendRequest(player: Player, intent: MarketIntent): { path: string, body: Record<string, unknown> } {
  switch (intent.action) {
    case 'claim':
      return { path: '/market/stalls', body: { stall_no: intent.stallNo, canopy: intent.canopy } }
    case 'list':
      return { path: '/market/lots', body: { slot: intent.slot, code: intent.code, quantity: intent.quantity, unit_price: intent.unitPrice } }
    case 'withdraw':
      return { path: `/market/lots/${intent.lotId}/withdraw`, body: {} }
    case 'buy':
      return { path: `/market/lots/${intent.lotId}/buy`, body: { quantity: intent.quantity, purchase_ref: `${player.accountId}-${intent.ref}` } }
  }
}

function sendMarketError(client: GameClient, request: number | null, message: string, code: string): void {
  client.send('market_error', { message, code, request })
}

function notifySeller(room: GameRoom, sellerAccountId: number, sold: { lotId: number, code: string, quantity: number }): void {
  const seller = [...room.players.values()].find((p) => p.accountId === sellerAccountId)
  room.clients.find((c) => c.sessionId === seller?.sessionId)?.send('market_sold', sold)
}

export async function onMarket(room: GameRoom, client: GameClient, payload: ClientPayload, now = Date.now()): Promise<void> {
  const raw = payload?.request
  const request = Number.isSafeInteger(raw) ? raw as number : null
  const player = room.players.get(client.sessionId)
  if (!player?.token || now < player.knockedOutUntil) {
    sendMarketError(client, request, 'You cannot use the market right now.', 'market_cannot_use')
    return
  }
  const intent = parseMarketIntent(payload)
  if (intent === null) {
    sendMarketError(client, request, 'This market action is not valid.', 'market_bad_request')
    return
  }
  if (now - player.lastMarketAt < MARKET_COOLDOWN_MS) {
    sendMarketError(client, request, 'Slow down a little.', 'market_busy')
    return
  }
  const market = room.market
  if (market === null || !market.open) {
    sendMarketError(client, request, 'The market is closed.', 'market_closed')
    return
  }
  const stallNo = targetStall(market, player, intent)
  if (stallNo === null) {
    if (intent.action === 'list') sendMarketError(client, request, 'Take a free stall first.', 'market_no_stall')
    else sendMarketError(client, request, 'This lot is no longer for sale.', 'market_lot_gone')
    return
  }
  if (!stallInReach(stallNo, player)) {
    sendMarketError(client, request, 'Walk up to the stall.', 'market_too_far')
    return
  }
  player.lastMarketAt = now
  const seller = intent.action === 'buy' ? stallOfLot(market, intent.lotId) : null
  const { path, body } = backendRequest(player, intent)
  try {
    const result = await callRealtimeBackend(player.token, path, 'POST', body)
    client.send('market_done', { action: intent.action, ...result, request })
    if (intent.action === 'buy' && seller !== null) {
      const code = seller.lots.find((lot) => lot.lot_id === intent.lotId)?.code ?? ''
      notifySeller(room, seller.account_id, { lotId: intent.lotId, code, quantity: intent.quantity })
    }
  } catch (error) {
    console.warn('[market] action failed:', error instanceof Error ? error.message : error)
    client.send('market_error', { ...errorPayload(error, 'The market could not complete this.', 'market_failed'), request })
  }
  await refreshMarket(room, player.token)
}

const scheduledBoundary = new WeakMap<GameRoom, string>()

function scheduleBoundaryRefresh(room: GameRoom, market: MarketSnapshot): void {
  const boundary = market.open ? market.closes_at : market.opens_at
  if (scheduledBoundary.get(room) === boundary) return
  scheduledBoundary.set(room, boundary)
  const delay = Math.max(0, Date.parse(boundary) - Date.now()) + BOUNDARY_DELAY_MS
  room.clock.setTimeout(() => {
    scheduledBoundary.delete(room)
    const token = [...room.players.values()].find((p) => p.token)?.token
    if (token) void refreshMarket(room, token)
  }, delay)
}

export function marketIsStale(market: MarketSnapshot | null, now = Date.now()): boolean {
  return market === null || now >= Date.parse(market.open ? market.closes_at : market.opens_at)
}

export async function refreshMarket(room: GameRoom, token: string, exceptClient?: GameClient): Promise<void> {
  try {
    room.market = await callBackendJson(token, '/market', 'GET') as unknown as MarketSnapshot
  } catch (error) {
    console.warn('[market] refresh failed:', error instanceof Error ? error.message : error)
    return
  }
  const market = room.market
  room.forEachClient((c) => c.send('market_sync', market), exceptClient)
  scheduleBoundaryRefresh(room, market)
}

export async function sendMarketOnJoin(room: GameRoom, client: GameClient, player: Player): Promise<void> {
  if (player.token && marketIsStale(room.market)) await refreshMarket(room, player.token, client)
  if (room.market !== null) client.send('market_sync', room.market)
}
