<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { sellQuantity } from '../../game/orchard'
import type { SaleArea } from '../../game/zoneDecor/zoneDecor.ts'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  area: SaleArea
  selling: boolean
  feedback: { kind: 'success' | 'error'; text: string } | null
  held: (code: string) => number
  itemName: (code: string) => string
}>()

const emit = defineEmits<{ sell: [code: string, quantity: number]; close: [] }>()

const wanted = ref<Record<string, number>>(Object.fromEntries(props.area.offers.map((o) => [o.code, props.held(o.code)])))

function quantity(code: string): number {
  return sellQuantity(wanted.value[code] ?? 0, props.held(code))
}

function step(code: string, delta: number): void {
  wanted.value = { ...wanted.value, [code]: sellQuantity(quantity(code) + delta, props.held(code)) }
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  emit('close')
  e.preventDefault()
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40" @mousedown.self="emit('close')">
    <section class="cc-hud w-[min(440px,92vw)] animate-cc-pop overflow-hidden p-0" :aria-label="`Sell to ${area.name}`">
      <header class="flex items-center justify-between bg-sun px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">{{ area.name }}</span>
        <button type="button" class="inline-flex items-center" aria-label="Close" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>
      <ul class="m-0 flex list-none flex-col gap-3 px-4 py-4">
        <li v-for="offer in area.offers" :key="offer.code" class="flex flex-col gap-1.5">
          <p class="m-0 flex flex-wrap items-center gap-1.5 text-sm text-fog">
            <span class="font-bold capitalize">{{ itemName(offer.code) }}</span>
            <UiCurrency currency="coins" :amount="offer.price" :size="14" />
            each<template v-if="offer.quota > 0 && offer.overPrice !== offer.price">, then <UiCurrency currency="coins" :amount="offer.overPrice" :size="14" /> after {{ offer.quota }} a day</template>
          </p>
          <p v-if="held(offer.code) === 0" class="m-0 text-xs text-mist">You have none.</p>
          <div v-else class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <button type="button" class="cc-btn cc-btn-sm" :aria-label="`One ${itemName(offer.code)} less`" :disabled="selling || quantity(offer.code) <= 1" @click="step(offer.code, -1)">−</button>
              <span class="w-8 text-center font-display text-lg text-fog" aria-live="polite">{{ quantity(offer.code) }}</span>
              <button type="button" class="cc-btn cc-btn-sm" :aria-label="`One ${itemName(offer.code)} more`" :disabled="selling || quantity(offer.code) >= held(offer.code)" @click="step(offer.code, 1)">+</button>
              <span class="text-xs text-mist">of {{ held(offer.code) }}</span>
            </div>
            <button type="button" class="cc-btn cc-btn-sm" :disabled="selling" @click="emit('sell', offer.code, quantity(offer.code))">Sell {{ quantity(offer.code) }}</button>
          </div>
        </li>
      </ul>
      <p v-if="feedback" class="m-0 px-4 py-2 text-xs font-bold" :class="feedback.kind === 'success' ? 'bg-mint/20 text-mint' : 'bg-coral/20 text-coral'" role="status">{{ feedback.text }}</p>
    </section>
  </div>
</template>
