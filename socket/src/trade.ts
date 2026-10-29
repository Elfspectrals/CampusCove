// Player-to-player trades, opened from the watch: request, accept, both offers live, both confirm, then the API
// swaps coins and items in one transaction (POST /trades/execute). The room is authoritative for who trades with
// whom, distance and confirmations; the API for ownership and balances.
import { randomUUID } from 'node:crypto'
import { type HttpMethod, type Json, callBackendJson, callRealtimeBackend, errorPayload } from './backend.ts'
import { unitAt } from './movement.ts'
import type { ClientPayload, GameClient, GameRoom, Player } from './types.ts'

/** Players listed by the watch's Trade app. */
export const TRADE_LIST_RADIUS = 12
/** Close enough to send or accept a request. */
export const TRADE_REACH = 4
/** Walking further than this from the partner cancels the trade. */
export const TRADE_BREAK_DISTANCE = 8
export const TRADE_REQUEST_TTL_MS = 30_000
const TRADE_REQUEST_COOLDOWN_MS = 2_000
const TRADE_OFFER_COOLDOWN_MS = 200
/** Must match TradeService::MAX_COINS / MAX_LINES / MAX_QUANTITY. */
export const MAX_TRADE_COINS = 1_000_000
const MAX_TRADE_LINES = 12
const MAX_TRADE_QUANTITY = 999
const ITEM_CODE = /^[A-Za-z0-9_]{1,64}$/

export type TradeCloseReason = 'declined' | 'cancelled' | 'expired' | 'too_far' | 'left'

export interface TradeItem {
  code: string
  name: string
  kind: string
  quantity: number
  previewImage: string | null
}

export interface TradeOffer {
  coins: number
  items: TradeItem[]
}

interface TradeSide {
  sessionId: string
  accountId: number
  offer: TradeOffer
  confirmed: boolean
  /** Latest offer update received; an older one still waiting on the API is dropped. */
  offerSeq: number
  lastOfferAt: number
}

export interface Trade {
  id: string
  status: 'requested' | 'open' | 'executing'
  /** [requester, target] */
  sides: [TradeSide, TradeSide]
  /** Bumped on every offer change: a confirmation only counts for the revision the player saw. */
  revision: number
}

export interface TradeRoom extends Pick<GameRoom, 'players' | 'housingUnits' | 'clients' | 'clock'> {
  trades: Map<string, Trade>
}

type CallBackend = (token: string | null, path: string, method?: HttpMethod, body?: unknown) => Promise<Json>

/** API calls, swapped for fakes in tests. */
export interface TradeBackend {
  /** GET /trades/offerable with the player's token. */
  fetch: CallBackend
  /** POST /trades/execute, a realtime-only route. */
  execute: CallBackend
}

const defaultBackend: TradeBackend = { fetch: callBackendJson, execute: callRealtimeBackend }

function warn(context: string, error: unknown): void {
  console.warn(`[trade] ${context}:`, error instanceof Error ? error.message : error)
}

const emptyOffer = (): TradeOffer => ({ coins: 0, items: [] })

function side(player: Player): TradeSide {
  return { sessionId: player.sessionId, accountId: player.accountId, offer: emptyOffer(), confirmed: false, offerSeq: 0, lastOfferAt: 0 }
}

function distance(a: Player, b: Player): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** Same place (outdoors, or inside the same building) and within `reach`. */
export function canTradeAt(room: TradeRoom, a: Player, b: Player, reach: number): boolean {
  return distance(a, b) <= reach && unitAt(room.housingUnits, a.x, a.z) === unitAt(room.housingUnits, b.x, b.z)
}

function clientOf(room: TradeRoom, sessionId: string): GameClient | undefined {
  return room.clients.find((c) => c.sessionId === sessionId)
}

function tradeOf(room: TradeRoom, player: Player, payload: ClientPayload): Trade | null {
  const trade = player.tradeId ? room.trades.get(player.tradeId) : undefined
  if (!trade || (typeof payload?.tradeId === 'string' && payload.tradeId !== trade.id)) return null
  return trade
}

function sideOf(trade: Trade, sessionId: string): TradeSide {
  return trade.sides[0].sessionId === sessionId ? trade.sides[0] : trade.sides[1]
}

function partnerSide(trade: Trade, sessionId: string): TradeSide {
  return trade.sides[0].sessionId === sessionId ? trade.sides[1] : trade.sides[0]
}

function sendError(client: GameClient | undefined, message: string, code: string): void {
  client?.send('trade_error', { message, code })
}

// ------------------------------------------------------------ list and request

/** The watch's Trade app: players around, nearest first, with whether they can be asked right now. */
export function nearbyTraders(room: TradeRoom, player: Player) {
  return [...room.players.values()]
    .filter((other) => other.sessionId !== player.sessionId && other.accountId !== player.accountId && canTradeAt(room, player, other, TRADE_LIST_RADIUS))
    .map((other) => ({
      sessionId: other.sessionId,
      pseudo: other.pseudo,
      distance: Math.round(distance(player, other) * 10) / 10,
      inReach: distance(player, other) <= TRADE_REACH,
      busy: other.tradeId !== null
    }))
    .sort((a, b) => a.distance - b.distance)
}

export function onTradeNearby(room: TradeRoom, client: GameClient): void {
  const player = room.players.get(client.sessionId)
  if (player) client.send('trade_nearby', { players: nearbyTraders(room, player) })
}

export function onTradeRequest(room: TradeRoom, client: GameClient, payload: ClientPayload, now = Date.now()): void {
  const player = room.players.get(client.sessionId)
  if (!player) return
  const targetId = typeof payload?.targetSessionId === 'string' ? payload.targetSessionId : null
  const target = targetId ? room.players.get(targetId) : undefined
  if (!target || target.sessionId === player.sessionId || target.accountId === player.accountId) {
    sendError(client, 'You cannot trade with this player.', 'trade_invalid_target')
    return
  }
  if (player.tradeId) {
    sendError(client, 'Finish your current trade first.', 'trade_busy')
    return
  }
  if (now - player.lastTradeRequestAt < TRADE_REQUEST_COOLDOWN_MS) return
  if (target.tradeId) {
    sendError(client, `${target.pseudo} is already trading.`, 'trade_partner_busy')
    return
  }
  if (!canTradeAt(room, player, target, TRADE_REACH)) {
    sendError(client, `Get closer to ${target.pseudo} to trade.`, 'trade_too_far')
    return
  }
  player.lastTradeRequestAt = now
  const trade: Trade = { id: randomUUID(), status: 'requested', sides: [side(player), side(target)], revision: 0 }
  room.trades.set(trade.id, trade)
  player.tradeId = trade.id
  target.tradeId = trade.id
  client.send('trade_pending', { tradeId: trade.id, toSessionId: target.sessionId, toPseudo: target.pseudo })
  clientOf(room, target.sessionId)?.send('trade_requested', { tradeId: trade.id, fromSessionId: player.sessionId, fromPseudo: player.pseudo })
  room.clock.setTimeout(() => {
    const current = room.trades.get(trade.id)
    if (current?.status === 'requested') closeTrade(room, current, 'expired')
  }, TRADE_REQUEST_TTL_MS)
}

export function onTradeRespond(room: TradeRoom, client: GameClient, payload: ClientPayload): void {
  const player = room.players.get(client.sessionId)
  const trade = player ? tradeOf(room, player, payload) : null
  // only the asked player answers
  if (!player || !trade || trade.status !== 'requested' || trade.sides[1].sessionId !== player.sessionId) return
  if (payload?.accept !== true) {
    closeTrade(room, trade, 'declined')
    return
  }
  const requester = room.players.get(trade.sides[0].sessionId)
  if (!requester || !canTradeAt(room, player, requester, TRADE_REACH)) {
    sendError(client, 'Get closer to trade.', 'trade_too_far')
    return
  }
  trade.status = 'open'
  sendTradeState(room, trade)
}

export function onTradeCancel(room: TradeRoom, client: GameClient, payload: ClientPayload): void {
  const player = room.players.get(client.sessionId)
  const trade = player ? tradeOf(room, player, payload) : null
  if (trade && trade.status !== 'executing') closeTrade(room, trade, 'cancelled', player!.sessionId)
}

// ------------------------------------------------------------ offers

/** Coins and `{ code, quantity }` lines from a client, merged and bounded; null when malformed. */
export function parseOffer(payload: ClientPayload): { coins: number, items: Map<string, number> } | null {
  const coins = payload?.coins ?? 0
  if (typeof coins !== 'number' || !Number.isInteger(coins) || coins < 0 || coins > MAX_TRADE_COINS) return null
  const rawItems = payload?.items ?? []
  if (!Array.isArray(rawItems) || rawItems.length > MAX_TRADE_LINES) return null
  const items = new Map<string, number>()
  for (const line of rawItems as unknown[]) {
    const code = (line as { code?: unknown } | null)?.code
    const quantity = (line as { quantity?: unknown } | null)?.quantity
    if (typeof code !== 'string' || !ITEM_CODE.test(code)) return null
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_TRADE_QUANTITY) return null
    items.set(code, (items.get(code) ?? 0) + quantity)
  }
  return items.size > MAX_TRADE_LINES ? null : { coins, items }
}

/**
 * Checks a parsed offer against what the API says the player can trade (GET /trades/offerable); item names and
 * pictures come from there, never from the client. Returns an error message when it is not covered.
 */
export function resolveOffer(parsed: { coins: number, items: Map<string, number> }, offerable: Json): TradeOffer | string {
  const coins = typeof offerable?.coins === 'number' ? offerable.coins : 0
  if (parsed.coins > coins) return 'You do not have that many coins.'
  const owned = new Map<string, Json>()
  for (const row of Array.isArray(offerable?.items) ? offerable.items : []) {
    if (typeof row?.code === 'string') owned.set(row.code, row)
  }
  const items: TradeItem[] = []
  for (const [code, quantity] of parsed.items) {
    const row = owned.get(code)
    if (!row) return 'This item cannot be traded.'
    if (typeof row.quantity !== 'number' || row.quantity < quantity) return `You do not have that many ${row.name}.`
    items.push({
      code,
      name: String(row.name),
      kind: String(row.kind),
      quantity,
      previewImage: typeof row.preview_image === 'string' ? row.preview_image : null
    })
  }
  return { coins: parsed.coins, items }
}

/** Every change resets both confirmations, so nobody confirms an offer they did not see. */
function resetConfirmations(trade: Trade): void {
  trade.revision++
  trade.sides[0].confirmed = false
  trade.sides[1].confirmed = false
}

export async function onTradeOffer(room: TradeRoom, client: GameClient, payload: ClientPayload, backend = defaultBackend, now = Date.now()): Promise<void> {
  const player = room.players.get(client.sessionId)
  const trade = player ? tradeOf(room, player, payload) : null
  if (!player || !trade || trade.status !== 'open') return
  const mine = sideOf(trade, player.sessionId)
  if (now - mine.lastOfferAt < TRADE_OFFER_COOLDOWN_MS) {
    // too fast: the client re-syncs from the state it gets back
    clientOf(room, player.sessionId)?.send('trade_state', tradeStateFor(room, trade, player.sessionId))
    return
  }
  mine.lastOfferAt = now
  const parsed = parseOffer(payload)
  if (!parsed) {
    sendError(client, 'Invalid offer.', 'trade_invalid_offer')
    return
  }
  const seq = ++mine.offerSeq
  resetConfirmations(trade)
  sendTradeState(room, trade)
  let resolved: TradeOffer | string
  try {
    resolved = resolveOffer(parsed, await backend.fetch(player.token, '/trades/offerable', 'GET'))
  } catch (error) {
    warn('offerable failed', error)
    resolved = 'Your inventory could not be checked. Try again.'
  }
  // the trade moved on while the API answered (closed, executing, or a newer offer from this player)
  if (room.trades.get(trade.id) !== trade || trade.status !== 'open' || mine.offerSeq !== seq) return
  if (typeof resolved === 'string') {
    sendError(client, resolved, 'trade_invalid_offer')
  } else {
    mine.offer = resolved
    resetConfirmations(trade)
  }
  sendTradeState(room, trade)
}

// ------------------------------------------------------------ confirm and execute

export async function onTradeConfirm(room: TradeRoom, client: GameClient, payload: ClientPayload, backend = defaultBackend): Promise<void> {
  const player = room.players.get(client.sessionId)
  const trade = player ? tradeOf(room, player, payload) : null
  if (!player || !trade || trade.status !== 'open') return
  // a confirmation for an offer that changed since: ignored, the player sees the new one
  if (payload?.revision !== trade.revision) return
  const mine = sideOf(trade, player.sessionId)
  mine.confirmed = true
  if (!partnerSide(trade, player.sessionId).confirmed) {
    sendTradeState(room, trade)
    return
  }
  await executeTrade(room, trade, backend)
}

async function executeTrade(room: TradeRoom, trade: Trade, backend: TradeBackend): Promise<void> {
  const [a, b] = trade.sides
  const playerA = room.players.get(a.sessionId)
  const playerB = room.players.get(b.sessionId)
  if (!playerA || !playerB) return
  if (!canTradeAt(room, playerA, playerB, TRADE_BREAK_DISTANCE)) {
    closeTrade(room, trade, 'too_far')
    return
  }
  const offerBody = (offer: TradeOffer) => ({ coins: offer.coins, items: offer.items.map(({ code, quantity }) => ({ code, quantity })) })
  if (a.offer.coins === 0 && a.offer.items.length === 0 && b.offer.coins === 0 && b.offer.items.length === 0) {
    resetConfirmations(trade)
    for (const s of trade.sides) sendError(clientOf(room, s.sessionId), 'Add something to the trade first.', 'trade_empty')
    sendTradeState(room, trade)
    return
  }
  // set before the await: a second confirm arriving meanwhile sees 'executing' and is ignored (no double spend)
  trade.status = 'executing'
  sendTradeState(room, trade)
  try {
    const result = await backend.execute(playerA.token, '/trades/execute', 'POST', {
      partner_account_id: playerB.accountId,
      trade_ref: trade.id,
      my_offer: offerBody(a.offer),
      partner_offer: offerBody(b.offer)
    })
    endTrade(room, trade)
    clientOf(room, a.sessionId)?.send('trade_completed', {
      tradeId: trade.id,
      coins: typeof result?.my_coins === 'number' ? result.my_coins : null,
      received: b.offer
    })
    clientOf(room, b.sessionId)?.send('trade_completed', {
      tradeId: trade.id,
      coins: typeof result?.partner_coins === 'number' ? result.partner_coins : null,
      received: a.offer
    })
  } catch (error) {
    warn('execute failed', error)
    if (room.trades.get(trade.id) !== trade) return
    trade.status = 'open'
    resetConfirmations(trade)
    const { message, code } = errorPayload(error, 'The trade failed.', 'trade_failed')
    for (const s of trade.sides) sendError(clientOf(room, s.sessionId), message, code)
    sendTradeState(room, trade)
  }
}

// ------------------------------------------------------------ state and closing

export function tradeStateFor(room: TradeRoom, trade: Trade, sessionId: string) {
  const mine = sideOf(trade, sessionId)
  const theirs = partnerSide(trade, sessionId)
  const partner = room.players.get(theirs.sessionId)
  return {
    tradeId: trade.id,
    status: trade.status,
    revision: trade.revision,
    me: { offer: mine.offer, confirmed: mine.confirmed },
    partner: { sessionId: theirs.sessionId, pseudo: partner?.pseudo ?? '', offer: theirs.offer, confirmed: theirs.confirmed }
  }
}

function sendTradeState(room: TradeRoom, trade: Trade): void {
  for (const s of trade.sides) clientOf(room, s.sessionId)?.send('trade_state', tradeStateFor(room, trade, s.sessionId))
}

function endTrade(room: TradeRoom, trade: Trade): void {
  room.trades.delete(trade.id)
  for (const s of trade.sides) {
    const player = room.players.get(s.sessionId)
    if (player?.tradeId === trade.id) player.tradeId = null
  }
}

/** `bySessionId`: the player who cancelled (the other one is told who did). */
export function closeTrade(room: TradeRoom, trade: Trade, reason: TradeCloseReason, bySessionId: string | null = null): void {
  endTrade(room, trade)
  for (const s of trade.sides) {
    clientOf(room, s.sessionId)?.send('trade_closed', { tradeId: trade.id, reason, byMe: bySessionId === s.sessionId })
  }
}

/** After every accepted move: walking away from the partner (or into another building) cancels the trade. */
export function checkTradeDistance(room: TradeRoom, player: Player): void {
  const trade = player.tradeId ? room.trades.get(player.tradeId) : undefined
  if (!trade || trade.status === 'executing') return
  const partner = room.players.get(partnerSide(trade, player.sessionId).sessionId)
  if (!partner || !canTradeAt(room, player, partner, TRADE_BREAK_DISTANCE)) closeTrade(room, trade, 'too_far')
}

/** The player disconnected (or was replaced by a new tab). */
export function onTradeLeave(room: TradeRoom, player: Player): void {
  const trade = player.tradeId ? room.trades.get(player.tradeId) : undefined
  // an executing trade finishes on its own: the API call already carries both offers
  if (trade && trade.status !== 'executing') closeTrade(room, trade, 'left')
}
