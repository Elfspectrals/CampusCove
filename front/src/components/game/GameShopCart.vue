<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { matches } from '../../config/keybindings'
import type { CartNotice } from '../../composables/game/useShopCart'
import { lineTotal, type CartShop } from '../../game/store/shopCart'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

defineProps<{
  shops: CartShop[]
  count: number
  total: number
  /** The shop whose cashier the player stands at; null when the cart was opened elsewhere. */
  payableShop: string | null
  payingShop: string | null
  notice: CartNotice | null
}>()

const emit = defineEmits<{
  setQuantity: [shopKey: string, shopCatalogItemId: number, quantity: number]
  remove: [shopKey: string, shopCatalogItemId: number]
  pay: []
  close: []
}>()

const { t } = useI18n()

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' && !matches('cart', e.code)) return
  e.preventDefault()
  e.stopPropagation()
  emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-start justify-center bg-black/40 p-4 pt-12" @mousedown.self="emit('close')">
    <section class="cc-panel flex max-h-[calc(100vh-4rem)] w-[min(560px,100%)] animate-cc-pop flex-col overflow-hidden" :aria-label="t('cart.title')">
      <header class="cc-panel-header flex items-center justify-between gap-3 bg-ink-950/40">
        <h2 class="cc-display m-0 text-xl leading-none">{{ t('cart.title') }}</h2>
        <button type="button" class="cc-btn cc-btn-ghost cc-btn-sm min-h-11 min-w-11" :aria-label="t('cart.close')" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <p v-if="shops.length === 0" class="m-0 p-5 text-sm font-semibold text-mist">{{ t('cart.empty') }}</p>
      <div v-else class="min-h-0 flex-1 overflow-y-auto p-2">
        <section v-for="shop in shops" :key="shop.shopKey" class="mb-2 rounded-xl bg-ink-950/30 p-2 last:mb-0" :aria-label="shop.shopName">
          <header class="flex items-center justify-between gap-2 px-1 pb-1">
            <span class="font-display text-[11px] uppercase tracking-[0.16em]" :class="shop.shopKey === payableShop ? 'text-sun' : 'text-mint'">
              {{ shop.shopName }}
            </span>
            <UiCurrency currency="coins" :amount="shop.total" :size="14" class="text-sm font-bold text-fog" />
          </header>
          <ul class="m-0 list-none p-0">
            <li v-for="line in shop.lines" :key="line.item.shopCatalogItemId" class="flex min-h-11 items-center gap-2 rounded-lg px-1 py-1 odd:bg-ink-950/30">
              <img
                v-if="line.item.previewImage"
                :src="line.item.previewImage"
                :alt="''"
                class="h-11 w-11 shrink-0 rounded-lg bg-ink-950/40 object-contain"
              />
              <span v-else class="h-11 w-11 shrink-0 rounded-lg bg-ink-950/40" />
              <span class="min-w-0 flex-1">
                <span class="block truncate font-bold text-fog">{{ line.item.name }}</span>
                <UiCurrency currency="coins" :amount="line.item.unitPrice" :size="11" class="text-[11px] text-mist" />
              </span>
              <span class="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  class="cc-btn cc-btn-ghost cc-btn-sm min-h-11 min-w-11"
                  :aria-label="t('cart.decrease', { name: line.item.name })"
                  @click="emit('setQuantity', shop.shopKey, line.item.shopCatalogItemId, line.quantity - 1)"
                >
                  −
                </button>
                <span class="w-6 text-center font-mono font-bold text-fog" :aria-label="t('cart.quantity', { name: line.item.name })">{{ line.quantity }}</span>
                <button
                  type="button"
                  class="cc-btn cc-btn-ghost cc-btn-sm min-h-11 min-w-11"
                  :aria-label="t('cart.increase', { name: line.item.name })"
                  :disabled="line.item.oneAtATime"
                  @click="emit('setQuantity', shop.shopKey, line.item.shopCatalogItemId, line.quantity + 1)"
                >
                  +
                </button>
              </span>
              <UiCurrency currency="coins" :amount="lineTotal(line)" :size="14" class="hidden w-16 shrink-0 justify-end text-sm font-bold text-sun sm:flex" />
              <button
                type="button"
                class="cc-btn cc-btn-ghost cc-btn-sm min-h-11 min-w-11 text-mist"
                :aria-label="t('cart.remove', { name: line.item.name })"
                @click="emit('remove', shop.shopKey, line.item.shopCatalogItemId)"
              >
                <UiIcon name="x" :size="16" />
              </button>
            </li>
          </ul>
          <button
            v-if="shop.shopKey === payableShop"
            type="button"
            class="cc-btn cc-btn-sun mt-2 min-h-11 w-full"
            :disabled="payingShop !== null"
            @click="emit('pay')"
          >
            {{ payingShop === shop.shopKey ? t('cart.paying') : t('cart.payHere', { amount: shop.total }) }}
          </button>
          <p v-else class="m-0 mt-1 px-1 text-[11px] font-bold text-mist">{{ t('cart.payAt', { shop: shop.shopName }) }}</p>
        </section>
      </div>

      <p
        v-if="notice"
        class="m-0 px-4 py-2 text-xs font-bold"
        :class="notice.kind === 'success' ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral'"
        role="status"
      >
        {{ t(notice.key, notice.params ?? {}) }}
      </p>
      <footer v-if="shops.length > 0" class="flex items-center justify-between gap-3 border-t-2 border-ink-950/60 bg-ink-950/50 px-4 py-2">
        <span class="text-[11px] font-semibold text-mist">{{ t('cart.hint') }}</span>
        <span class="flex shrink-0 items-center gap-2 font-bold text-fog">
          {{ t('cart.subtotal', count) }}
          <UiCurrency currency="coins" :amount="total" :size="18" class="text-lg text-sun" />
        </span>
      </footer>
    </section>
  </div>
</template>
