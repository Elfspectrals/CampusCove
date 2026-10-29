<script setup lang="ts">
import type { ShopItem } from '../../api/itemShop'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

defineProps<{
  title: string
  items: ShopItem[]
  total: number
  paying: boolean
  feedback: { kind: 'success' | 'error'; text: string } | null
}>()

const emit = defineEmits<{ pay: []; remove: [item: ShopItem]; close: [] }>()

function coins(item: ShopItem): number {
  return item.options.find((o) => o.currency === 'coins')?.price ?? 0
}
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40" @mousedown.self="emit('close')">
    <section class="cc-hud w-[min(440px,92vw)] animate-cc-pop overflow-hidden p-0" :aria-label="`${title} checkout`">
      <header class="flex items-center justify-between bg-sun px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">{{ title }} · Checkout</span>
        <button type="button" class="inline-flex items-center" aria-label="Close the checkout" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>
      <p v-if="items.length === 0" class="m-0 px-4 py-6 text-center text-sm text-mist">
        Your basket is empty. Click a piece on a mannequin to add it.
      </p>
      <ul v-else class="m-0 max-h-[50vh] list-none overflow-y-auto p-2">
        <li v-for="item in items" :key="item.item_def_id" class="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-950/40">
          <img :src="item.preview_image ?? ''" :alt="item.name" class="h-14 w-14 shrink-0 rounded-lg bg-ink-950/40 object-contain" />
          <p class="m-0 min-w-0 flex-1 truncate font-display text-base text-fog">{{ item.name }}</p>
          <UiCurrency currency="coins" :amount="coins(item)" :size="16" />
          <button type="button" class="inline-flex items-center text-mist" :aria-label="`Remove ${item.name}`" @click="emit('remove', item)">
            <UiIcon name="x" :size="16" />
          </button>
        </li>
      </ul>
      <footer class="flex items-center justify-between gap-3 border-t border-ink-950/40 px-4 py-3">
        <span class="inline-flex items-center gap-2 font-display text-sm text-fog">
          Total <UiCurrency currency="coins" :amount="total" :size="16" />
        </span>
        <button type="button" class="cc-btn cc-btn-sm" :disabled="paying || items.length === 0" @click="emit('pay')">
          {{ paying ? 'Paying…' : 'Pay' }}
        </button>
      </footer>
      <p
        v-if="feedback"
        class="m-0 px-4 py-2 text-xs font-bold"
        :class="feedback.kind === 'success' ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral'"
      >
        {{ feedback.text }}
      </p>
    </section>
  </div>
</template>
