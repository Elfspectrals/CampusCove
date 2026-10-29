/**
 * Player trades, client side: the offer being edited and the wording of trade outcomes. The server decides
 * everything (socket/src/trade.ts, backend TradeService); this only keeps the draft within what the player owns.
 */
import type { TradeCloseReason, TradeOfferPayload } from '../types/gameRealtime'

/** Must match MAX_TRADE_COINS (socket) / TradeService::MAX_COINS. */
const MAX_TRADE_COINS = 1_000_000
/** Must match MAX_TRADE_LINES (socket) / TradeService::MAX_LINES. */
export const MAX_TRADE_LINES = 12

/** Coins and `code -> quantity` the player is offering. */
export interface OfferDraft {
  coins: number
  items: Record<string, number>
}

export function emptyDraft(): OfferDraft {
  return { coins: 0, items: {} }
}

export function draftFromOffer(offer: TradeOfferPayload): OfferDraft {
  return { coins: offer.coins, items: Object.fromEntries(offer.items.map((it) => [it.code, it.quantity])) }
}

/** Whole coins between 0 and what the player has. */
export function clampCoins(value: number, owned: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(Math.floor(value), owned, MAX_TRADE_COINS))
}

/** Sets one line of the offer (0 removes it); quantities stay within `owned`, lines within MAX_TRADE_LINES. */
export function withItemQuantity(draft: OfferDraft, code: string, quantity: number, owned: number): OfferDraft {
  const items = { ...draft.items }
  const next = Math.max(0, Math.min(Math.floor(quantity), owned))
  if (next === 0) delete items[code]
  else if (code in items || Object.keys(items).length < MAX_TRADE_LINES) items[code] = next
  return { coins: draft.coins, items }
}

export function draftPayload(draft: OfferDraft): { coins: number; items: Array<{ code: string; quantity: number }> } {
  return { coins: draft.coins, items: Object.entries(draft.items).map(([code, quantity]) => ({ code, quantity })) }
}

export function sameDraft(a: OfferDraft, b: OfferDraft): boolean {
  return JSON.stringify(draftPayload(a)) === JSON.stringify(draftPayload(b))
}

export function isEmptyOffer(offer: TradeOfferPayload): boolean {
  return offer.coins === 0 && offer.items.length === 0
}

/** "120 coins, 2 × Sandwich" ("nothing" for an empty offer). */
export function describeOffer(offer: TradeOfferPayload): string {
  const parts = offer.items.map((it) => (it.quantity > 1 ? `${it.quantity} × ${it.name}` : it.name))
  if (offer.coins > 0) parts.unshift(`${offer.coins} coins`)
  return parts.length > 0 ? parts.join(', ') : 'nothing'
}

/** Message shown when a trade or a request ends without a swap. */
export function closedMessage(reason: TradeCloseReason, byMe: boolean, partner: string): string {
  switch (reason) {
    case 'declined':
      return byMe ? 'Trade request declined.' : `${partner} declined your trade request.`
    case 'cancelled':
      return byMe ? 'Trade cancelled.' : `${partner} cancelled the trade.`
    case 'expired':
      return 'The trade request expired.'
    case 'too_far':
      return 'Trade cancelled: you walked too far apart.'
    case 'left':
      return `Trade cancelled: ${partner} left.`
  }
}
