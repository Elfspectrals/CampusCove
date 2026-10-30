<script setup lang="ts">
import { computed } from 'vue'
import type { ScreenEffects } from '../../game/survival'
import type { KnockoutCause } from '../../composables/game/useSurvival'

const props = defineProps<{
  effects: ScreenEffects | null
  damageFlash: number
  knockedOut: boolean
  /** Starvation / wounds, or a drunken black-out: changes the black screen texts. */
  cause: KnockoutCause
  hospitalBill: number | null
  lostBelongings: boolean
  message: string | null
  recovering: number | null
  reducedEffects: boolean
}>()

const heartbeat = computed(() => `${(props.effects?.heartbeatPeriod ?? 1).toFixed(2)}s`)

const blackout = computed(() => props.cause === 'alcohol')
const billText = computed(() => {
  if (props.hospitalBill === null) return null
  if (props.hospitalBill <= 0) return 'The hospital waived the bill.'
  return blackout.value ? `Bill: ${props.hospitalBill} coins` : `Hospital bill: ${props.hospitalBill} coins`
})
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-[15] overflow-hidden">
    <!-- thirst: blurred edges when critical (the desaturation itself is a filter on the canvas) -->
    <div
      v-if="effects && effects.edgeBlur > 0"
      class="cc-survival-blur absolute inset-0"
      :style="{ opacity: effects.edgeBlur }"
    />
    <!-- hunger: warm orange vignette -->
    <div
      v-if="effects && effects.hungerVignette > 0"
      class="absolute inset-0 transition-opacity duration-1000"
      :style="{
        opacity: effects.hungerVignette,
        background: 'radial-gradient(ellipse at center, transparent 45%, rgb(239 159 39 / 0.85) 100%)',
      }"
    />
    <!-- health: red vignette beating like a heart -->
    <div
      v-if="effects && effects.healthVignette > 0"
      class="cc-survival-heartbeat absolute inset-0"
      :style="{
        '--cc-beat-opacity': effects.healthVignette,
        animationDuration: heartbeat,
        background: 'radial-gradient(ellipse at center, transparent 40%, rgb(163 45 45 / 0.95) 100%)',
      }"
    />
    <!-- hit: a short red flash on the edges, replayed on every hit -->
    <div
      v-if="damageFlash > 0"
      :key="damageFlash"
      class="cc-survival-hit absolute inset-0"
      style="background: radial-gradient(ellipse at center, transparent 35%, rgb(226 75 74 / 0.9) 100%)"
    />
    <Transition name="cc-ko">
      <div v-if="knockedOut" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/90 text-center">
        <p class="font-display text-2xl tracking-wide text-fog">{{ blackout ? 'You blacked out…' : 'You passed out…' }}</p>
        <p class="text-sm text-mist">
          {{ blackout ? 'You wake up at Cove Clinic with a headache.' : "You'll wake up at Cove Clinic, a bit weak." }}
        </p>
        <p v-if="billText" class="text-xs font-bold text-coral">{{ billText }}</p>
        <p v-if="lostBelongings" class="text-xs text-mist">Your inventory and your clothes were lost.</p>
      </div>
    </Transition>
    <div
      v-if="recovering !== null"
      class="absolute inset-0 flex flex-col items-center justify-end gap-2 pb-28 text-center"
      :class="reducedEffects ? '' : 'bg-gradient-to-t from-black/70 via-black/20 to-transparent'"
    >
      <p class="font-display text-xl tracking-wide text-fog">Recovering at Cove Clinic…</p>
      <div
        class="h-2 w-[min(320px,70vw)] overflow-hidden rounded-full bg-ink-950/60"
        role="progressbar"
        :aria-valuenow="Math.round(recovering * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <div class="h-full rounded-full bg-mint" :style="{ width: `${recovering * 100}%` }" />
      </div>
    </div>
    <p
      v-if="message && !knockedOut"
      class="cc-hud absolute bottom-[148px] left-1/2 max-w-sm -translate-x-1/2 px-3 py-1.5 text-center text-xs font-bold text-fog"
    >
      {{ message }}
    </p>
  </div>
</template>

<style scoped>
.cc-survival-blur {
  backdrop-filter: blur(5px);
  mask-image: radial-gradient(ellipse at center, transparent 50%, black 100%);
  transition: opacity 1s;
}
.cc-survival-heartbeat {
  animation-name: cc-beat;
  animation-iteration-count: infinite;
  animation-timing-function: ease-out;
}
@keyframes cc-beat {
  0%,
  100% {
    opacity: calc(var(--cc-beat-opacity) * 0.55);
  }
  12% {
    opacity: var(--cc-beat-opacity);
  }
  30% {
    opacity: calc(var(--cc-beat-opacity) * 0.7);
  }
  42% {
    opacity: calc(var(--cc-beat-opacity) * 0.95);
  }
}
.cc-survival-hit {
  animation: cc-hit 0.45s ease-out forwards;
}
@keyframes cc-hit {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
.cc-ko-enter-active {
  transition: opacity 1.2s ease-in;
}
.cc-ko-leave-active {
  transition: opacity 1.5s ease-out;
}
.cc-ko-enter-from,
.cc-ko-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .cc-survival-heartbeat {
    animation: none;
    opacity: calc(var(--cc-beat-opacity) * 0.8);
  }
}
</style>
