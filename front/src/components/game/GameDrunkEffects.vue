<script setup lang="ts">
import { computed } from 'vue'
import { DOUBLE_VISION_FILTER_ID } from '../../composables/game/useIntoxication'
import type { DrunkScreenEffects } from '../../game/pub/intoxication'

const props = defineProps<{ effects: DrunkScreenEffects }>()

/** Offset of the faint second image, in CSS pixels. */
const MAX_DOUBLE_PX = 9

const doubleOffset = computed(() => (props.effects.doubleVision * MAX_DOUBLE_PX).toFixed(1))
const ghostOpacity = computed(() => (0.45 * props.effects.doubleVision).toFixed(2))
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-[14] overflow-hidden">
    <!-- the canvas points its CSS filter at this: the picture blended with a shifted, half-transparent copy of itself -->
    <svg class="absolute h-0 w-0" aria-hidden="true">
      <defs>
        <filter :id="DOUBLE_VISION_FILTER_ID" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
          <feOffset in="SourceGraphic" :dx="doubleOffset" dy="0" result="shifted" />
          <feComponentTransfer in="shifted" result="ghost">
            <feFuncA type="linear" :slope="ghostOpacity" />
          </feComponentTransfer>
          <feBlend in="ghost" in2="SourceGraphic" mode="normal" />
        </filter>
      </defs>
    </svg>
    <!-- alcohol: blurred edges, stronger as the glasses add up -->
    <div v-if="effects.blur > 0" class="cc-drunk-blur absolute inset-0" :style="{ opacity: effects.blur }" />
    <!-- a warm, rosy vignette from the first pint on -->
    <div
      v-if="effects.warmth > 0"
      class="absolute inset-0 transition-opacity duration-1000"
      :style="{
        opacity: effects.warmth * 0.6,
        background: 'radial-gradient(ellipse at center, transparent 40%, rgb(214 122 60 / 0.85) 100%)',
      }"
    />
  </div>
</template>

<style scoped>
.cc-drunk-blur {
  backdrop-filter: blur(6px);
  mask-image: radial-gradient(ellipse at center, transparent 35%, black 95%);
  transition: opacity 1s;
}
</style>
