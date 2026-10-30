<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { ShopItem, ShopItemFood } from '../../api/itemShop'
import type { OrderVia } from '../../composables/game/usePub'
import { POUR_MS } from '../../game/gameRoomConstants'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

defineProps<{
  items: ShopItem[]
  loading: boolean
  /** Code of the drink being ordered (the server has not answered yet). */
  ordering: string | null
  feedback: { kind: 'success' | 'error'; text: string } | null
  via: OrderVia
}>()

const emit = defineEmits<{ order: [item: ShopItem]; close: [] }>()

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  emit('close')
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))

const pourSeconds = Math.round(POUR_MS / 1000)

function coins(item: ShopItem): number {
  return item.options.find((o) => o.currency === 'coins')?.price ?? 0
}

function serving(food: ShopItemFood | null | undefined): string {
  if (!food) return ''
  const thirst = food.thirst > 0 ? `+${food.thirst * food.portions} thirst · ` : ''
  return `${thirst}${food.portions > 1 ? `${food.portions} sips` : 'one go'}`
}
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40" @mousedown.self="emit('close')">
    <section class="cc-hud w-[min(440px,92vw)] animate-cc-pop overflow-hidden p-0" aria-label="The Salty Shamrock menu">
      <header class="flex items-center justify-between bg-mint px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">The Salty Shamrock · Drinks</span>
        <button type="button" class="inline-flex items-center" aria-label="Close the menu" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>
      <p class="m-0 px-4 pt-2 text-[11px] font-bold text-mist">
        {{ via === 'bartender' ? `The barman pours it (${pourSeconds} s) and slides it down the bar.` : 'Served straight at the counter.' }}
      </p>
      <p v-if="loading" class="m-0 px-4 py-6 text-center text-sm text-mist">Chalking up the board…</p>
      <ul v-else class="m-0 max-h-[60vh] list-none overflow-y-auto p-2">
        <li
          v-for="item in items"
          :key="item.item_def_id"
          class="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-ink-950/40"
        >
          <img
            :src="item.preview_image ?? ''"
            :alt="item.name"
            class="h-14 w-14 shrink-0 rounded-lg bg-ink-950/40 object-contain"
          />
          <div class="min-w-0 flex-1">
            <p class="m-0 truncate font-display text-base text-fog">{{ item.name }}</p>
            <p class="m-0 text-[11px] font-bold text-pool">{{ serving(item.food) }}</p>
          </div>
          <button
            type="button"
            class="cc-btn cc-btn-sm inline-flex items-center gap-1.5"
            :disabled="ordering !== null"
            @click="emit('order', item)"
          >
            <UiCurrency currency="coins" :amount="coins(item)" :size="16" />
          </button>
        </li>
      </ul>
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
