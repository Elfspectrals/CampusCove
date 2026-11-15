import { shallowRef, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'

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
  const offer = shallowRef<GearOffer | null>(null)

  function ask(): void {
    offer.value = null
    deps.gameRoomRef.value?.send('sports_gear_quote', {})
  }

  function rent(): void {
    if (offer.value) deps.gameRoomRef.value?.send('sports_gear_rent', {})
  }

  function clear(): void {
    offer.value = null
  }

  const handlers = {
    onOffer(data: GearOffer): void {
      offer.value = data
    },
    onRented(data: { gear: string; cash: number }): void {
      offer.value = null
      deps.say(deps.rentedText(data.gear, data.cash))
    },
    onRoomJoined: clear,
  }

  return { offer, ask, rent, clear, handlers }
}
