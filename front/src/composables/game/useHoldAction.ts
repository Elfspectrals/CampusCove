import { onUnmounted, ref } from 'vue'
import { HOLD_MS } from '../../game/admin/adminConsole'

/** Press and hold a button for HOLD_MS to run an action that cannot be undone in one click; letting go cancels it. */
export function useHoldAction() {
  const holding = ref<string | null>(null)
  let timer: number | undefined

  function cancel(): void {
    window.clearTimeout(timer)
    holding.value = null
  }

  function start(key: string, run: () => void): void {
    cancel()
    holding.value = key
    timer = window.setTimeout(() => {
      holding.value = null
      run()
    }, HOLD_MS)
  }

  onUnmounted(cancel)

  return { holding, start, cancel }
}
