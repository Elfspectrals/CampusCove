import { onUnmounted, ref, watch } from 'vue'
import * as inventoryApi from '../api/inventory'
import type { AccountInventoryRow, InventoryKindFilter } from '../api/inventory'

export function useLockerInventory() {
  const items = ref<AccountInventoryRow[]>([])
  const loading = ref<boolean>(true)
  const loadError = ref<string | null>(null)

  const kindFilter = ref<InventoryKindFilter>('cosmetic')
  const searchInput = ref<string>('')
  const debouncedQ = ref<string>('')

  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  watch(searchInput, (value) => {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debouncedQ.value = value.trim()
      debounceTimer = null
    }, 350)
  })

  watch([kindFilter, debouncedQ], () => {
    void loadInventory()
  }, { immediate: true })

  onUnmounted(() => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  })

  async function loadInventory(): Promise<void> {
    loading.value = true
    loadError.value = null
    try {
      const res = await inventoryApi.fetchAccountInventory({
        kind: kindFilter.value,
        q: debouncedQ.value === '' ? undefined : debouncedQ.value,
      })
      items.value = res.items
    } catch (error: unknown) {
      loadError.value = error instanceof Error ? error.message : 'Could not load inventory'
      items.value = []
    } finally {
      loading.value = false
    }
  }

  return {
    items,
    loading,
    loadError,
    kindFilter,
    searchInput,
    debouncedQ,
    loadInventory,
  }
}
