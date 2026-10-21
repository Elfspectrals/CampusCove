<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { ShopItem } from '../../api/itemShop'
import { isPreviewOnlyItem } from '../../game/fishingPreviewItems'
import { RARITY_META, Rarity } from '../../game/rarity'
import { currencyLabel, isApartmentItem, rarityClass } from '../../utils/itemShopPresentation'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

/** Side panel of the item selected in the New Nation showroom: preview, prices and the buy button. */
const props = defineProps<{
  item: ShopItem
  rarity: Rarity
  isLoggedIn: boolean
  purchasing: boolean
  feedback: { kind: 'success' | 'error'; text: string } | undefined
}>()

const emit = defineEmits<{
  close: []
  buy: [item: ShopItem]
}>()

const previewOnly = computed(() => isPreviewOnlyItem(props.item))
const legendaryGlow = computed(() =>
  props.rarity === Rarity.Legendary ? { boxShadow: `0 0 14px ${RARITY_META[Rarity.Legendary].glow}` } : undefined,
)
</script>

<template>
  <aside
    class="cc-panel-glass absolute bottom-24 right-4 w-[min(calc(100%-2rem),360px)] animate-cc-pop p-5 sm:bottom-auto sm:right-6 sm:top-6"
  >
    <div
      v-if="item.preview_image"
      :class="[rarityClass(rarity), 'cc-rarity-bg cc-rarity-border mb-4 flex h-44 items-center justify-center overflow-hidden rounded-2xl border-2']"
    >
      <img
        :src="item.preview_image"
        :alt="item.name"
        class="h-full w-full object-contain p-2"
        loading="lazy"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
    </div>
    <div class="flex items-start justify-between gap-3">
      <div>
        <span
          :class="[rarityClass(rarity), 'cc-rarity-text mb-1 inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-widest cc-rarity-border']"
          :style="legendaryGlow"
        >{{ RARITY_META[rarity].label }}</span>
        <p class="cc-eyebrow m-0 text-pool">
          {{ isApartmentItem(item) ? 'Apartment asset' : 'Skin & cosmetic' }}
        </p>
        <h2 class="cc-display m-0 mt-1 text-3xl leading-tight">{{ item.name }}</h2>
      </div>
      <button
        type="button"
        class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon"
        aria-label="Close and return to overview"
        @click="emit('close')"
      >
        <UiIcon name="x" :size="16" />
      </button>
    </div>
    <p v-if="item.description" class="m-0 mt-3 text-sm font-semibold text-mist">{{ item.description }}</p>

    <ul class="m-0 mt-4 list-none space-y-1.5 p-0 text-sm">
      <li
        v-for="option in item.options"
        :key="option.shop_catalog_item_id"
        class="flex items-center justify-between rounded-xl bg-ink-950/50 px-3 py-2"
      >
        <span class="font-bold text-mist">{{ currencyLabel(option.currency) }}</span>
        <UiCurrency
          :currency="option.currency"
          :amount="option.price"
          :class="option.currency === 'coins' ? 'text-sun' : 'text-grape'"
        />
      </li>
    </ul>

    <div
      v-if="feedback"
      :class="['cc-alert mt-3', feedback.kind === 'success' ? 'cc-alert-success' : 'cc-alert-error']"
      role="status"
    >
      {{ feedback.text }}
    </div>

    <p v-if="previewOnly" class="cc-eyebrow m-0 mt-4 text-grape">Admin preview — not for sale</p>
    <button
      v-else-if="isLoggedIn"
      type="button"
      class="cc-btn cc-btn-sun cc-btn-lg cc-btn-shine mt-4 w-full"
      :disabled="purchasing"
      @click="emit('buy', item)"
    >
      {{ purchasing ? 'Processing…' : 'Buy' }}
    </button>
    <RouterLink v-else to="/login" class="cc-btn cc-btn-pool mt-4 w-full">Sign in to buy</RouterLink>
    <RouterLink
      v-if="!previewOnly"
      :to="{ name: isApartmentItem(item) ? 'shop' : 'shop-skin' }"
      class="mt-3 block text-center text-xs font-extrabold text-pool hover:underline"
    >
      Open in the shop
    </RouterLink>
  </aside>
</template>
