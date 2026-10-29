<script setup lang="ts">
import { computed } from 'vue'
import { MAX_STAMINA, isTired } from '../../game/stamina'

const props = defineProps<{ stamina: number; reducedEffects: boolean }>()

const tired = computed(() => isTired(props.stamina))
</script>

<template>
  <div
    v-if="stamina < MAX_STAMINA"
    class="pointer-events-none absolute bottom-[85px] left-1/2 z-20 h-[5px] w-[min(240px,60vw)] -translate-x-1/2 overflow-hidden rounded-full bg-black/60 shadow-[0_0_0_1px_rgb(0_0_0/0.6)]"
    :class="tired && !reducedEffects ? 'cc-stamina-tired' : ''"
    role="progressbar"
    aria-label="Stamina"
    :aria-valuenow="Math.round(stamina)"
    aria-valuemin="0"
    :aria-valuemax="MAX_STAMINA"
  >
    <div
      class="h-full rounded-full"
      :class="tired ? 'bg-coral' : 'bg-mint'"
      :style="{ width: `${(stamina / MAX_STAMINA) * 100}%` }"
    />
  </div>
</template>

<style scoped>
.cc-stamina-tired {
  animation: cc-stamina-pulse 0.5s ease-in-out infinite alternate;
}
@keyframes cc-stamina-pulse {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .cc-stamina-tired {
    animation: none;
  }
}
</style>
