import { ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import type { JailErrorPayload, JailReleasedPayload, JailStatePayload } from '../../types/gameRealtime'

export interface JailSentence {
  kind: JailStatePayload['kind']
  endsAt: number
  fine: number
  stars: number
}

export interface JailDeps {
  gameRoomRef: ShallowRef<Room | null>
  onReleased: (data: JailReleasedPayload) => void
}

export function useJail(deps: JailDeps) {
  const sentence = ref<JailSentence | null>(null)
  const error = ref<JailErrorPayload | null>(null)
  const paying = ref(false)

  function pay(): void {
    if (!sentence.value || paying.value) return
    paying.value = true
    error.value = null
    deps.gameRoomRef.value?.send('jail_pay')
  }

  const handlers = {
    onState(data: JailStatePayload): void {
      sentence.value = { kind: data.kind, endsAt: Date.now() + data.msLeft, fine: data.fine, stars: data.stars }
      paying.value = false
      error.value = null
    },
    onReleased(data: JailReleasedPayload): void {
      sentence.value = null
      paying.value = false
      error.value = null
      if (typeof data.bank === 'number') applyCachedBalanceAfterPurchase('coins', data.bank)
      if (typeof data.cash === 'number') applyCachedBalanceAfterPurchase('cash', data.cash)
      deps.onReleased(data)
    },
    onError(data: JailErrorPayload): void {
      paying.value = false
      error.value = data
    },
  }

  return { sentence, error, paying, pay, handlers }
}
