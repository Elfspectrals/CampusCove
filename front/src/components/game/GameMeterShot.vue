<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { SHOT_COUNT, shotLayout, shotsScore } from '../../game/pub/meterShot'
import UiCurrency from '../ui/UiCurrency.vue'
import UiIcon from '../ui/UiIcon.vue'

const props = defineProps<{
  seed: number
  startedAt: number
  result: { ms: number; coins: number } | null
}>()

const emit = defineEmits<{ done: [ms: number]; close: [] }>()

const WRONG_SHAKE_MS = 250

const order = computed(() => shotLayout(props.seed))
const drunk = ref(0)
const elapsedMs = ref(0)
const wrongIndex = ref<number | null>(null)

let origin = 0
let finalMs: number | null = null
let frame = 0
let wrongTimer = 0

const nextIndex = computed(() => order.value[drunk.value] ?? null)
const playing = computed(() => finalMs === null && props.result === null)
const shownMs = computed(() => props.result?.ms ?? elapsedMs.value)
const onTrack = computed(() => shotsScore(elapsedMs.value).coins)

function restart(): void {
  drunk.value = 0
  elapsedMs.value = 0
  finalMs = null
  origin = performance.now()
}

watch(() => props.startedAt, restart, { immediate: true })

function tick(timestamp: number): void {
  if (playing.value) elapsedMs.value = timestamp - origin
  frame = requestAnimationFrame(tick)
}

function drink(index: number): void {
  if (!playing.value) return
  if (index !== nextIndex.value) {
    wrongIndex.value = index
    clearTimeout(wrongTimer)
    wrongTimer = window.setTimeout(() => (wrongIndex.value = null), WRONG_SHAKE_MS)
    return
  }
  drunk.value += 1
  if (drunk.value < SHOT_COUNT) return
  finalMs = Math.round(performance.now() - origin)
  elapsedMs.value = finalMs
  emit('done', finalMs)
}

function isDown(index: number): boolean {
  return order.value.indexOf(index) < drunk.value
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`
}

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  emit('close')
  e.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  frame = requestAnimationFrame(tick)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true)
  cancelAnimationFrame(frame)
  clearTimeout(wrongTimer)
})
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-center justify-center bg-black/40 select-none" @mousedown.self="emit('close')">
    <section class="cc-hud w-[min(720px,94vw)] animate-cc-pop overflow-hidden p-0" aria-label="Meter Shot">
      <header class="flex items-center justify-between bg-grape px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">Meter Shot</span>
        <button type="button" class="inline-flex items-center" aria-label="Leave the plank" @click="emit('close')">
          <UiIcon name="x" :size="18" />
        </button>
      </header>

      <div class="flex flex-col gap-4 px-5 py-4">
        <div class="flex items-baseline justify-between gap-3">
          <p class="m-0 font-display text-3xl tabular-nums text-fog" aria-live="off">{{ seconds(shownMs) }}</p>
          <p class="m-0 text-xs font-bold text-mist">
            <template v-if="result">{{ SHOT_COUNT }} shots down.</template>
            <template v-else-if="playing">{{ drunk }} / {{ SHOT_COUNT }} · on track for <span :class="onTrack > 0 ? 'text-mint' : 'text-coral'">{{ onTrack > 0 ? `+${onTrack} coins` : 'no tip' }}</span></template>
            <template v-else>Bottoms up! Checking with the barman…</template>
          </p>
        </div>

        <div
          class="relative flex items-center justify-between gap-1 rounded-md border-2 border-[#3a2412] px-3 py-3"
          style="background: repeating-linear-gradient(90deg, #7a4a24 0 18px, #6e4220 18px 22px, #825029 22px 44px)"
        >
          <button
            v-for="index in SHOT_COUNT"
            :key="index - 1"
            type="button"
            class="relative grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 transition-transform"
            :class="[
              isDown(index - 1)
                ? 'border-white/20 bg-black/30 opacity-40'
                : index - 1 === nextIndex && playing
                  ? 'scale-110 border-sun bg-sun/20 shadow-[0_0_14px_rgb(var(--cc-sun)/0.7)]'
                  : 'border-white/60 bg-white/15',
              wrongIndex === index - 1 ? 'cc-shot-wrong' : '',
            ]"
            :aria-label="isDown(index - 1) ? `Shot ${index}, empty` : index - 1 === nextIndex ? `Shot ${index}, drink this one` : `Shot ${index}`"
            :disabled="!playing"
            @click="drink(index - 1)"
          >
            <span class="block h-6 w-6 rounded-full" :class="isDown(index - 1) ? 'bg-transparent' : 'bg-white/80 shadow-[inset_0_-6px_0_rgb(255_255_255/0.5)]'" />
          </button>
        </div>

        <p v-if="playing" class="m-0 text-center text-[11px] text-mist">
          Knock back the glowing shot, then the next one. Under 6 s pays 30 coins, under 9 s pays 15.
        </p>
        <p v-else-if="result" class="m-0 flex items-center justify-center gap-2 text-center font-display text-lg text-fog">
          <template v-if="result.coins > 0">
            Legend. <UiCurrency currency="coins" :amount="result.coins" :size="18" /> from the barman.
          </template>
          <template v-else>Too slow for a tip, but what a show.</template>
        </p>
      </div>

      <footer v-if="result" class="flex items-center justify-end border-t border-white/10 px-4 py-3">
        <button type="button" class="cc-btn cc-btn-sm cc-btn-grape" @click="emit('close')">Back to the bar</button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.cc-shot-wrong {
  animation: cc-shot-wrong 250ms ease-out both;
}
@keyframes cc-shot-wrong {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-4px);
  }
  75% {
    transform: translateX(4px);
  }
}
</style>
