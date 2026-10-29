import { computed, onScopeDispose, ref, watch, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import { fetchOfferable, type OfferableItem } from '../../api/trades'
import {
  clampCoins,
  closedMessage,
  describeOffer,
  draftFromOffer,
  draftPayload,
  emptyDraft,
  isEmptyOffer,
  sameDraft,
  withItemQuantity,
  type OfferDraft,
} from '../../game/trade'
import type {
  TradeClosedPayload,
  TradeCompletedPayload,
  TradeErrorPayload,
  TradeNearbyPlayer,
  TradePendingPayload,
  TradeRequestedPayload,
  TradeStatePayload,
} from '../../types/gameRealtime'

/** Offer edits are sent once the player stops typing / clicking for this long. */
const OFFER_DEBOUNCE_MS = 350
/** An edit the server never answered (dropped): give up waiting and show the server's copy. */
const OFFER_ACK_TIMEOUT_MS = 3000
/** The nearby list follows players walking around while the watch menu is open. */
const NEARBY_REFRESH_MS = 2000

export interface TradeDeps {
  gameRoomRef: ShallowRef<Room | null>
  refreshInventory: () => void
  /** New coin balance after a completed trade. */
  onCoins: (balance: number) => void
  /** Clothes may have changed hands: the wardrobe and the clothing store re-read what is owned. */
  onClothesChanged: () => void
  say: (text: string) => void
}

/**
 * Player-to-player trading from the watch (tap the watch key): pick a nearby player, they accept, both offer coins
 * and items, both confirm. The realtime server runs the trade and the API swaps everything in one transaction;
 * this composable only mirrors the server state and edits this player's offer.
 */
export function useTrade(deps: TradeDeps) {
  const menuOpen = ref(false)
  const nearby = ref<TradeNearbyPlayer[]>([])
  const incoming = ref<TradeRequestedPayload | null>(null)
  const outgoing = ref<TradePendingPayload | null>(null)
  const state = ref<TradeStatePayload | null>(null)
  const offerable = ref<{ coins: number; items: OfferableItem[] } | null>(null)
  const offerableError = ref<string | null>(null)
  const draft = ref<OfferDraft>(emptyDraft())
  const error = ref<string | null>(null)

  /** The trade window: from the accept until the trade completes or closes. */
  const windowOpen = computed(() => state.value !== null && state.value.status !== 'requested')
  /** An edit not sent yet (debounced). */
  const editing = ref(false)
  /** The last edit sent, until the server shows it back (or refuses it). */
  const awaiting = ref<OfferDraft | null>(null)
  /** Confirm is held back while the server has not applied this player's latest edit. */
  const syncing = computed(() => editing.value || awaiting.value !== null)

  let offerTimer: number | undefined
  let ackTimer: number | undefined
  let nearbyTimer: number | undefined
  let partnerName = ''

  const send = (type: string, payload?: unknown) => deps.gameRoomRef.value?.send(type, payload)

  // ------------------------------------------------------------ watch menu

  function openMenu(): void {
    if (windowOpen.value) return
    if (document.pointerLockElement) document.exitPointerLock()
    error.value = null
    menuOpen.value = true
  }

  function closeMenu(): void {
    menuOpen.value = false
  }

  watch(menuOpen, (open) => {
    window.clearInterval(nearbyTimer)
    nearbyTimer = undefined
    if (!open) return
    send('trade_nearby')
    nearbyTimer = window.setInterval(() => send('trade_nearby'), NEARBY_REFRESH_MS)
  })

  function request(player: TradeNearbyPlayer): void {
    error.value = null
    partnerName = player.pseudo
    send('trade_request', { targetSessionId: player.sessionId })
  }

  function respond(accept: boolean): void {
    const req = incoming.value
    if (!req) return
    partnerName = req.fromPseudo
    send('trade_respond', { tradeId: req.tradeId, accept })
  }

  function cancel(): void {
    const tradeId = state.value?.tradeId ?? outgoing.value?.tradeId ?? incoming.value?.tradeId
    if (tradeId) send('trade_cancel', { tradeId })
  }

  // ------------------------------------------------------------ offer

  async function loadOfferable(): Promise<void> {
    offerableError.value = null
    try {
      offerable.value = await fetchOfferable()
    } catch (e) {
      offerableError.value = e instanceof Error ? e.message : 'Your inventory could not be loaded.'
    }
  }

  function ownedQuantity(code: string): number {
    return offerable.value?.items.find((it) => it.code === code)?.quantity ?? 0
  }

  /** Shows the server's copy of this player's offer, unless they are still editing. */
  function resyncDraft(): void {
    if (!editing.value && awaiting.value === null && state.value) draft.value = draftFromOffer(state.value.me.offer)
  }

  function scheduleOfferSend(): void {
    editing.value = true
    window.clearTimeout(offerTimer)
    offerTimer = window.setTimeout(() => {
      editing.value = false
      const tradeId = state.value?.tradeId
      if (!tradeId) return
      awaiting.value = { ...draft.value, items: { ...draft.value.items } }
      send('trade_offer', { tradeId, ...draftPayload(draft.value) })
      window.clearTimeout(ackTimer)
      ackTimer = window.setTimeout(() => {
        awaiting.value = null
        resyncDraft()
      }, OFFER_ACK_TIMEOUT_MS)
    }, OFFER_DEBOUNCE_MS)
  }

  function setCoins(value: number): void {
    draft.value = { ...draft.value, coins: clampCoins(value, offerable.value?.coins ?? 0) }
    scheduleOfferSend()
  }

  function setItem(code: string, quantity: number): void {
    draft.value = withItemQuantity(draft.value, code, quantity, ownedQuantity(code))
    scheduleOfferSend()
  }

  function confirm(): void {
    const current = state.value
    if (!current || current.status !== 'open' || syncing.value) return
    send('trade_confirm', { tradeId: current.tradeId, revision: current.revision })
  }

  // ------------------------------------------------------------ server messages

  function reset(): void {
    window.clearTimeout(offerTimer)
    window.clearTimeout(ackTimer)
    editing.value = false
    awaiting.value = null
    incoming.value = null
    outgoing.value = null
    state.value = null
    offerable.value = null
    draft.value = emptyDraft()
    error.value = null
  }

  function onNearby(players: TradeNearbyPlayer[]): void {
    nearby.value = players
  }

  function onRequested(data: TradeRequestedPayload): void {
    incoming.value = data
    partnerName = data.fromPseudo
  }

  function onPending(data: TradePendingPayload): void {
    outgoing.value = data
    partnerName = data.toPseudo
  }

  function onState(data: TradeStatePayload): void {
    const opening = !windowOpen.value && data.status !== 'requested'
    state.value = data
    partnerName = data.partner.pseudo
    if (opening) {
      incoming.value = null
      outgoing.value = null
      menuOpen.value = false
      if (document.pointerLockElement) document.exitPointerLock()
      void loadOfferable()
    }
    if (awaiting.value && sameDraft(awaiting.value, draftFromOffer(data.me.offer))) {
      awaiting.value = null
      window.clearTimeout(ackTimer)
    }
    resyncDraft()
  }

  function onClosed(data: TradeClosedPayload): void {
    const name = partnerName
    reset()
    deps.say(closedMessage(data.reason, data.byMe, name))
  }

  function onCompleted(data: TradeCompletedPayload): void {
    const gaveClothes = state.value?.me.offer.items.some((it) => it.kind === 'cosmetic') ?? false
    const gotClothes = data.received.items.some((it) => it.kind === 'cosmetic')
    reset()
    if (data.coins !== null) deps.onCoins(data.coins)
    deps.refreshInventory()
    if (gaveClothes || gotClothes) deps.onClothesChanged()
    deps.say(isEmptyOffer(data.received) ? 'Trade complete.' : `Trade complete: you received ${describeOffer(data.received)}.`)
  }

  function onError(data: TradeErrorPayload): void {
    error.value = data.message
    if (!menuOpen.value && !windowOpen.value) deps.say(data.message)
    // the offer was refused: show what the server kept
    if (data.code === 'trade_invalid_offer') {
      awaiting.value = null
      resyncDraft()
    }
  }

  onScopeDispose(() => {
    window.clearTimeout(offerTimer)
    window.clearTimeout(ackTimer)
    window.clearInterval(nearbyTimer)
  })

  return {
    menuOpen,
    windowOpen,
    nearby,
    incoming,
    outgoing,
    state,
    offerable,
    offerableError,
    draft,
    error,
    syncing,
    openMenu,
    closeMenu,
    request,
    respond,
    cancel,
    setCoins,
    setItem,
    confirm,
    handlers: { onNearby, onRequested, onPending, onState, onClosed, onCompleted, onError },
  }
}
