<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ officer: string }>()

const { t } = useI18n()
</script>

<template>
  <section
    class="cc-hud absolute left-1/2 top-16 z-30 w-[min(360px,92vw)] -translate-x-1/2 animate-cc-pop px-4 py-3"
    role="status"
    aria-labelledby="cc-cuffed-title"
  >
    <p id="cc-cuffed-title" class="m-0 font-display text-[11px] uppercase tracking-[0.16em] text-mint">{{ t('police.cuffedTitle') }}</p>
    <p class="m-0 mt-1 text-sm font-bold text-fog">{{ t('police.cuffedBy', { officer }) }}</p>
    <p class="m-0 mt-0.5 text-xs text-mist">{{ t('police.cuffedHint') }}</p>
  </section>
</template>
