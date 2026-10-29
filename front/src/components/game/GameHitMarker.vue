<script setup lang="ts">
import type { HitMarkerKind } from '../../composables/game/usePunch'

defineProps<{
  marker: { kind: HitMarkerKind; id: number } | null
}>()
</script>

<template>
  <div
    v-if="marker"
    :key="marker.id"
    class="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
    aria-hidden="true"
  >
    <div v-if="marker.kind === 'hit'" class="cc-hit-marker relative h-6 w-6">
      <span
        v-for="angle in [45, 135, 225, 315]"
        :key="angle"
        class="absolute left-1/2 top-1/2 h-0.5 w-2 rounded-full bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.35)]"
        :style="{ transform: `translate(-50%, -50%) rotate(${angle}deg) translateX(7px)` }"
      />
    </div>
    <div v-else class="cc-whiff-marker h-2.5 w-2.5 rounded-full border-2 border-white/70" />
  </div>
</template>

<style scoped>
.cc-hit-marker {
  animation: cc-hit-marker 120ms ease-out both;
}
.cc-whiff-marker {
  animation: cc-whiff-marker 160ms ease-out both;
}
@keyframes cc-hit-marker {
  0% {
    opacity: 1;
    transform: scale(1.35);
  }
  60% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scale(1);
  }
}
@keyframes cc-whiff-marker {
  0% {
    opacity: 0.6;
    transform: scale(1);
  }
  100% {
    opacity: 0;
    transform: scale(1.8);
  }
}
</style>
