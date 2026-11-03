<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { APPLE_PRICE, sellQuantity } from '../../game/orchard'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  carried: number
  selling: boolean
  feedback: { kind: 'success' | 'error'; text: string } | null
}>()

const emit = defineEmits<{ sell: [quantity: number]; close: [] }>()

const quantity = ref(props.carried)
watch(
  () => props.carried,
  (carried) => {
    quantity.value = sellQuantity(quantity.value, carried)
  },
)

function step(delta: number): void {
  quantity.value = sellQuantity(quantity.value + delta, props.carried)
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
    <section class="cc-hud w-[min(400px,92vw)] animate-cc-pop overflow-hidden p-0" aria-label="Sell apples to the farmer">
      <header class="flex items-center justify-between bg-sun px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">Cove Orchard · Farmer</span>
        <button type="button" class="inline-flex items-center" aria-label="Close" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>
      <div class="flex flex-col gap-3 px-4 py-4">
        <p class="m-0 flex items-center gap-1.5 text-sm text-fog">
          I buy fresh apples:
          <UiCurrency currency="coins" :amount="APPLE_PRICE" :size="16" />
          each.
        </p>
        <p v-if="carried === 0" class="m-0 text-sm text-mist">Your basket is empty. Pick some apples in the orchard first.</p>
        <template v-else>
          <p class="m-0 text-xs text-mist">{{ carried }} {{ carried === 1 ? 'apple' : 'apples' }} in your basket</p>
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="cc-btn cc-btn-sm"
                aria-label="One apple less"
                :disabled="selling || quantity <= 1"
                @click="step(-1)"
              >
                −
              </button>
              <span class="w-8 text-center font-display text-lg text-fog" aria-live="polite">{{ quantity }}</span>
              <button
                type="button"
                class="cc-btn cc-btn-sm"
                aria-label="One apple more"
                :disabled="selling || quantity >= carried"
                @click="step(1)"
              >
                +
              </button>
            </div>
            <button type="button" class="cc-btn cc-btn-sm" :disabled="selling" @click="emit('sell', quantity)">
              Sell {{ quantity }}
            </button>
          </div>
        </template>
      </div>
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
