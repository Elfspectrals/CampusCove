<script setup lang="ts">
import type { ShopItem } from '../../api/itemShop'
import type { Rarity } from '../../game/rarity'
import { rarityClass } from '../../utils/itemShopPresentation'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

/** Bottom strip listing the showroom items, with previous / next browsing. */
defineProps<{
  items: ShopItem[]
  selectedId: number | null
  walking: boolean
  rarityOf: (item: ShopItem) => Rarity
}>()

const emit = defineEmits<{
  select: [id: number]
  step: [delta: 1 | -1]
}>()
</script>

<template>
  <div class="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-ink-950/90 to-transparent px-4 pb-4 pt-10">
    <button
      type="button"
      class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon shrink-0"
      aria-label="Previous item"
      @click="emit('step', -1)"
    >
      <UiIcon name="chevron-left" :size="18" />
    </button>
    <ul class="m-0 flex min-w-0 flex-1 list-none gap-2 overflow-x-auto p-0 pb-1">
      <li v-for="item in items" :key="item.item_def_id" class="shrink-0">
        <button
          type="button"
          :class="[
            'rounded-xl border-2 px-3 py-2 text-left text-xs backdrop-blur transition',
            selectedId === item.item_def_id
              ? 'border-sun bg-sun/20 shadow-[0_0_14px_rgb(var(--cc-sun)/0.4)]'
              : 'bg-ink-950/75 hover:border-pool/70',
            selectedId !== item.item_def_id ? rarityClass(rarityOf(item)) + ' cc-rarity-border' : '',
          ]"
          @click="emit('select', item.item_def_id)"
        >
          <span class="block max-w-[160px] truncate font-display text-sm tracking-wide">{{ item.name }}</span>
          <UiCurrency
            v-if="item.options[0]"
            :currency="item.options[0].currency"
            :amount="item.options[0].price"
            :size="14"
            :class="item.options[0].currency === 'coins' ? 'text-sun' : 'text-grape'"
          />
        </button>
      </li>
    </ul>
    <button
      type="button"
      class="cc-btn cc-btn-ghost cc-btn-sm cc-btn-icon shrink-0"
      aria-label="Next item"
      @click="emit('step', 1)"
    >
      <UiIcon name="chevron-right" :size="18" />
    </button>
    <p class="m-0 hidden shrink-0 text-[11px] font-bold text-mist lg:block">
      {{ walking ? 'WASD to walk · Drag or Q/E to turn · N/B next home' : 'Drag to orbit · Q/E to rotate · ←/→ to browse' }}
    </p>
  </div>
</template>
