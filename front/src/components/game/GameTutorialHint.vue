<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { HintKind } from '../../game/tutorialHints'

defineProps<{ kind: HintKind; x: number; y: number; useKey: string }>()
const { t } = useI18n()
</script>

<template>
  <p
    class="cc-hud pointer-events-none absolute z-10 m-0 w-max max-w-[min(18rem,80vw)] -translate-x-1/2 -translate-y-full animate-cc-pop border-sun/60 px-3 py-2 text-center text-sm font-bold text-fog"
    :style="{ left: `${x}px`, top: `${y}px` }"
    role="status"
  >
    {{ t(`tutorial.hints.${kind}`, { key: useKey }) }}
  </p>
</template>
