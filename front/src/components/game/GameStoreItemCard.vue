<script setup lang="ts">
import { computed } from 'vue'
import type { StoreTarget } from '../../composables/game/useFurnitureStore'
import { itemRarity, rarityClass } from '../../utils/itemShopPresentation'
import UiCurrency from '../ui/UiCurrency.vue'

const props = defineProps<{
  target: StoreTarget
  /** Result of the last purchase in the store ("Added to your inventory", or an error). */
  feedback: { kind: 'success' | 'error'; text: string } | null
  /** Store name in the header; Cove Home when omitted. */
  brand?: string
}>()

const previewSrc = computed(() => props.target.item?.preview_image ?? `/assets/decor/${props.target.display.key}/preview.png`)
const dimensions = computed(() => {
  const [w, h, d] = props.target.display.size
  return `${w.toFixed(1)} × ${d.toFixed(1)} × ${h.toFixed(1)} m`
})
const rarity = computed(() => (props.target.item ? itemRarity(props.target.item) : null))
</script>

<template>
  <aside
    class="cc-hud pointer-events-none absolute bottom-24 right-3 z-20 w-[300px] animate-cc-pop overflow-hidden p-0"
    :class="rarity ? rarityClass(rarity) : ''"
    aria-live="polite"
  >
    <div class="flex items-center justify-between bg-sun px-3 py-1.5 text-ink-950">
      <span class="font-display text-[11px] uppercase tracking-[0.18em]">{{ brand ?? 'Cove Home' }} · {{ target.departmentLabel }}</span>
      <span v-if="rarity" class="text-[10px] font-black uppercase tracking-widest opacity-70">{{ rarity }}</span>
    </div>
    <div class="flex gap-3 p-3">
      <img :src="previewSrc" :alt="`${target.name} preview`" class="h-24 w-24 shrink-0 rounded-xl bg-ink-950/40 object-contain" />
      <div class="min-w-0 flex-1">
        <p class="cc-display m-0 truncate text-xl leading-tight text-fog">{{ target.name }}</p>
        <p class="m-0 mt-1 text-[11px] font-semibold leading-snug text-mist">{{ target.display.description }}</p>
        <p class="m-0 mt-1 font-mono text-[10px] text-mist/80">{{ dimensions }}</p>
      </div>
    </div>
    <div class="flex items-center justify-between border-t-2 border-ink-950/60 bg-ink-950/50 px-3 py-2">
      <UiCurrency v-if="target.coins !== null" currency="coins" :amount="target.coins" :size="20" class="text-lg text-sun" />
      <span v-else class="text-sm font-bold text-mist">Not on sale yet</span>
      <span v-if="target.item" class="text-[11px] font-extrabold uppercase tracking-wider text-fog">Click to buy</span>
    </div>
    <p
      v-if="feedback"
      class="m-0 px-3 py-1.5 text-[11px] font-bold"
      :class="feedback.kind === 'success' ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral'"
    >
      {{ feedback.text }}
    </p>
  </aside>
</template>
