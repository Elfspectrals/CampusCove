import { computed, ref, shallowRef, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import { matches } from '../../config/keybindings'

const OFFER_SHOWN_MS = 10_000
const ASK_GAP_MS = 1500
const NO_GEAR_ERRORS = new Set(['sports_no_gear'])
const NO_GEAR_CORRECTIONS = new Set(['no_swimsuit', 'no_skates'])

export interface GearOffer {
  gear: string
  price: number
}

export interface GearRentalDeps {
  gameRoomRef: ShallowRef<Room | null>
  say: (text: string) => void
  rentedText: (gear: string, cash: number) => string
}

export function useGearRental(deps: GearRentalDeps) {
  const shown = shallowRef<(GearOffer & { until: number }) | null>(null)
  const now = ref(Date.now())
  let lastAskAt = -Infinity

  const offer = computed<GearOffer | null>(() => (shown.value && now.value < shown.value.until ? { gear: shown.value.gear, price: shown.value.price } : null))

  function ask(): void {
    if (performance.now() - lastAskAt < ASK_GAP_MS) return
    lastAskAt = performance.now()
    deps.gameRoomRef.value?.send('sports_gear_quote', {})
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (e.repeat || !offer.value) return false
    const accepted = matches('acceptChallenge', e.code)
    if (!accepted && !matches('declineChallenge', e.code)) return false
    shown.value = null
    if (accepted) deps.gameRoomRef.value?.send('sports_gear_rent', {})
    return true
  }

  function tick(): void {
    if (shown.value) now.value = Date.now()
  }

  const handlers = {
    onSportsError(code: string): void {
      if (NO_GEAR_ERRORS.has(code)) ask()
    },
    onCorrection(reason: string | undefined): void {
      if (reason !== undefined && NO_GEAR_CORRECTIONS.has(reason)) ask()
    },
    onNoGear: ask,
    onOffer(data: GearOffer): void {
      now.value = Date.now()
      shown.value = { ...data, until: now.value + OFFER_SHOWN_MS }
    },
    onRented(data: { gear: string; cash: number }): void {
      shown.value = null
      deps.say(deps.rentedText(data.gear, data.cash))
    },
    onRoomJoined(): void {
      shown.value = null
    },
  }

  return { offer, onKeyDown, tick, handlers }
}
