import { ref } from 'vue'
import { fetchBankScreen, type BankScreen } from '../../api/bank'

export function useWatchBank() {
  const screen = ref<BankScreen | null>(null)
  const error = ref<string | null>(null)

  async function load(): Promise<void> {
    error.value = null
    try {
      screen.value = await fetchBankScreen()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  return { screen, error, load }
}
