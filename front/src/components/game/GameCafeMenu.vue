<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { ShopItem, ShopItemFood } from '../../api/itemShop'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

defineProps<{
  title: string
  items: ShopItem[]
  loading: boolean
  buyingId: number | null
  feedback: { kind: 'success' | 'error'; text: string } | null
}>()

const emit = defineEmits<{ buy: [item: ShopItem]; close: [] }>()

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  emit('close')
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))

function coins(item: ShopItem): number {
  return item.options.find((o) => o.currency === 'coins')?.price ?? 0
}

/** "+12 hunger · +3 thirst" for the whole item (every portion). */
function restores(food: ShopItemFood | null | undefined): Array<{ label: string; tone: string }> {
  if (!food) return []
  const out: Array<{ label: string; tone: string }> = []
  if (food.hunger > 0) out.push({ label: `+${food.hunger * food.portions} hunger`, tone: 'text-sun' })
  if (food.thirst > 0) out.push({ label: `+${food.thirst * food.portions} thirst`, tone: 'text-pool' })
  if (food.health > 0) out.push({ label: `+${food.health * food.portions} health`, tone: 'text-coral' })
  if (food.effect === 'speed_boost') out.push({ label: 'speed boost', tone: 'text-mint' })
  if (food.effect === 'heal_over_time') out.push({ label: 'heals over time', tone: 'text-coral' })
  return out
}
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40" @mousedown.self="emit('close')">
    <section class="cc-hud w-[min(440px,92vw)] animate-cc-pop overflow-hidden p-0" :aria-label="`${title} menu`">
      <header class="flex items-center justify-between bg-sun px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">{{ title }} · Menu</span>
        <button type="button" class="inline-flex items-center" aria-label="Close the menu" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>
      <p v-if="loading" class="m-0 px-4 py-6 text-center text-sm text-mist">Loading the menu…</p>
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
            <p class="m-0 flex flex-wrap gap-x-2 text-[11px] font-bold">
              <span v-for="r in restores(item.food)" :key="r.label" :class="r.tone">{{ r.label }}</span>
              <span v-if="item.food && item.food.portions > 1" class="text-mist">{{ item.food.portions }} bites</span>
            </p>
          </div>
          <button
            type="button"
            class="cc-btn cc-btn-sm inline-flex items-center gap-1.5"
            :disabled="buyingId !== null"
            @click="emit('buy', item)"
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
