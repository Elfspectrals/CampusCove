import { computed, ref, shallowRef } from 'vue'
import {
  addToCart,
  cartByShop,
  cartCount,
  cartTotal,
  checkoutLines,
  quantityInCart,
  removeLine,
  removeShop,
  setQuantity,
  type CartItem,
  type CartLine,
} from '../../game/store/shopCart'

/** A message for the HUD, translated where it is shown (`cart.*` keys in i18n/messages.ts). */
export interface CartNotice {
  kind: 'success' | 'error'
  key: string
  params?: Record<string, string | number>
}

/** Charges this shop's lines at its cashier; the key stays the same while the lines do, so a retry pays once. */
export type CartPayer = (lines: Array<{ id: number; quantity: number }>, checkoutKey: string) => Promise<void>

/**
 * One cart for every shop with a cashier (mall shops, zone sale areas). Clicking an item adds one to the cart; the
 * cart screen (cart key, or Use at a cashier) shows every shop's lines, and each shop's lines are paid at that
 * shop's own cashier.
 */
export function useShopCart() {
  const lines = ref<CartLine[]>([])
  const open = ref(false)
  /** The cashier the player opened the cart at: only that shop's lines can be paid. */
  const counter = shallowRef<{ shopKey: string; pay: CartPayer } | null>(null)
  const payingShop = ref<string | null>(null)
  const notice = shallowRef<CartNotice | null>(null)
  const checkoutKeys = new Map<string, string>()
  let noticeTimer: ReturnType<typeof setTimeout> | undefined

  const shops = computed(() => cartByShop(lines.value))
  const count = computed(() => cartCount(lines.value))
  const total = computed(() => cartTotal(lines.value))

  function notify(next: CartNotice): void {
    notice.value = next
    clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => (notice.value = null), 4000)
  }

  /** Any change to a shop's lines makes its next payment a new one. */
  function change(next: CartLine[], shopKey: string): void {
    lines.value = next
    checkoutKeys.delete(shopKey)
  }

  /** One more of the item; returns the quantity now in the cart (unchanged when the line is full). */
  function add(shopKey: string, shopName: string, item: CartItem): number {
    change(addToCart(lines.value, shopKey, shopName, item), shopKey)
    return quantityInCart(lines.value, shopKey, item.shopCatalogItemId)
  }

  function openCart(): void {
    if (document.pointerLockElement) document.exitPointerLock()
    open.value = true
  }

  function openAtCounter(shopKey: string, pay: CartPayer): void {
    counter.value = { shopKey, pay }
    openCart()
  }

  /** The player walked away from this cashier: the cart stays open, but nothing can be paid from it. */
  function leaveCounter(shopKey: string): void {
    if (counter.value?.shopKey === shopKey) counter.value = null
  }

  function close(): void {
    open.value = false
    counter.value = null
  }

  async function payAtCounter(): Promise<void> {
    const at = counter.value
    if (!at || payingShop.value) return
    const toPay = checkoutLines(lines.value, at.shopKey)
    if (toPay.length === 0) return
    let key = checkoutKeys.get(at.shopKey)
    if (!key) {
      key = crypto.randomUUID()
      checkoutKeys.set(at.shopKey, key)
    }
    payingShop.value = at.shopKey
    try {
      await at.pay(toPay, key)
      change(removeShop(lines.value, at.shopKey), at.shopKey)
      notify({ kind: 'success', key: 'cart.paid' })
      if (lines.value.length === 0) close()
    } catch (e) {
      // the key is kept: paying again with the same lines cannot charge twice
      notify({ kind: 'error', key: 'cart.serverError', params: { message: e instanceof Error ? e.message : String(e) } })
    } finally {
      payingShop.value = null
    }
  }

  return {
    lines,
    shops,
    count,
    total,
    open,
    payableShop: computed(() => counter.value?.shopKey ?? null),
    payingShop,
    notice,
    notify,
    add,
    quantityOf: (shopKey: string, shopCatalogItemId: number) => quantityInCart(lines.value, shopKey, shopCatalogItemId),
    shopTotal: (shopKey: string) => shops.value.find((shop) => shop.shopKey === shopKey)?.total ?? 0,
    shopCount: (shopKey: string) => cartCount(lines.value.filter((line) => line.shopKey === shopKey)),
    setQuantity: (shopKey: string, shopCatalogItemId: number, quantity: number) =>
      change(setQuantity(lines.value, shopKey, shopCatalogItemId, quantity), shopKey),
    remove: (shopKey: string, shopCatalogItemId: number) => change(removeLine(lines.value, shopKey, shopCatalogItemId), shopKey),
    openCart,
    openAtCounter,
    leaveCounter,
    close,
    payAtCounter,
  }
}

export type ShopCart = ReturnType<typeof useShopCart>
