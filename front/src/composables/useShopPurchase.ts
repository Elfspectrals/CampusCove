import { computed, ref } from 'vue'
import { purchaseShopItem, type ShopCurrency, type ShopItem, type ShopItemCurrencyOption } from '../api/itemShop'
import { getStoredAuth } from '../api/session'
import { useWalletBalances } from './useWalletBalances'

interface PurchaseFeedback {
  kind: 'success' | 'error'
  text: string
}

/**
 * Buying a shop item: the confirm modal state (item, chosen currency, balance before / after) and the
 * result message per item. Feeds `ItemShopPurchaseConfirmModal`.
 */
export function useShopPurchase() {
  const balances = useWalletBalances()
  const isLoggedIn = computed(() => Boolean(getStoredAuth()?.token))
  const confirmItem = ref<ShopItem | null>(null)
  const confirmCurrency = ref<ShopCurrency>('coins')
  /** shop_catalog_item_id being bought, null when idle. */
  const purchasingId = ref<number | null>(null)
  const feedbackByItem = ref<Record<number, PurchaseFeedback>>({})

  const confirmOption = computed<ShopItemCurrencyOption | null>(
    () => confirmItem.value?.options.find((opt) => opt.currency === confirmCurrency.value) ?? null,
  )

  const confirmCurrent = computed(() => {
    if (!confirmOption.value) return null
    return confirmOption.value.currency === 'coins' ? balances.value.coins : balances.value.premium
  })

  const confirmAfter = computed(() => {
    const cur = confirmCurrent.value
    if (cur === null || !confirmOption.value) return null
    return cur - confirmOption.value.price
  })

  function openPurchaseConfirm(item: ShopItem): void {
    if (!isLoggedIn.value) return
    confirmItem.value = item
    confirmCurrency.value = item.options[0]?.currency ?? 'coins'
  }

  function closePurchaseConfirm(): void {
    confirmItem.value = null
  }

  function setFeedback(itemDefId: number, feedback: PurchaseFeedback | null): void {
    const next = { ...feedbackByItem.value }
    if (feedback) next[itemDefId] = feedback
    else delete next[itemDefId]
    feedbackByItem.value = next
  }

  async function confirmPurchase(): Promise<void> {
    const item = confirmItem.value
    const selected = confirmOption.value
    if (!item || !selected) return
    setFeedback(item.item_def_id, null)
    purchasingId.value = selected.shop_catalog_item_id
    try {
      const result = await purchaseShopItem({
        shop_catalog_item_id: selected.shop_catalog_item_id,
        currency: selected.currency,
      })
      setFeedback(item.item_def_id, { kind: 'success', text: result.message })
      closePurchaseConfirm()
    } catch (e) {
      setFeedback(item.item_def_id, { kind: 'error', text: e instanceof Error ? e.message : 'Purchase failed' })
    } finally {
      purchasingId.value = null
    }
  }

  return {
    isLoggedIn,
    confirmItem,
    confirmCurrency,
    confirmOption,
    confirmCurrent,
    confirmAfter,
    purchasingId,
    feedbackByItem,
    openPurchaseConfirm,
    closePurchaseConfirm,
    confirmPurchase,
  }
}
