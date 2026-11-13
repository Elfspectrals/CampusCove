<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ x: number; y: number; onScreen: boolean; angle: number; metres: number }>()
const { t } = useI18n()
</script>

<template>
  <div
    class="pointer-events-none absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
    :style="{ left: `${x}px`, top: `${y}px` }"
    aria-hidden="true"
  >
    <span v-if="!onScreen" class="absolute text-lg text-sun [text-shadow:0_1px_2px_rgb(0_0_0)]" :style="{ transform: `rotate(${angle}rad) translateX(26px)` }">▶</span>
    <span class="block size-4 rotate-45 border-2 border-ink-950 bg-sun shadow-[0_1px_4px_rgb(0_0_0/0.6)]" />
    <span class="font-display text-xs text-fog [text-shadow:0_1px_2px_rgb(0_0_0)]">{{ t('tutorial.metres', { n: metres }) }}</span>
  </div>
</template>
