import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getCachedWalletBalances, subscribeAuth } from '../api/auth'

/** Reactive cached wallet balances (updates after purchases / auth changes). */
export function useWalletBalances() {
  const tick = ref(0)
  onMounted(() => {
    const unsub = subscribeAuth(() => {
      tick.value++
    })
    onUnmounted(unsub)
  })
  return computed(() => {
    void tick.value
    return getCachedWalletBalances()
  })
}
