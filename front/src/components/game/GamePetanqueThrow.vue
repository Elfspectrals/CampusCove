<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PetanqueMode } from '../../game/sports/petanque'

const props = defineProps<{
  kind: 'jack' | 'boule'
  mode: PetanqueMode
  power: number | null
}>()

const { t } = useI18n()

const powerPercent = computed(() => Math.round((props.power ?? 0) * 100))
</script>

<template>
  <div class="flex flex-col gap-1 border-t border-line pt-2">
    <p class="m-0 flex items-center justify-between font-bold text-fog">
      <span>{{ kind === 'jack' ? t('petanque.modes.jack') : t(`petanque.modes.${mode}`) }}</span>
      <span v-if="kind === 'boule'" class="text-mist">{{ t('petanque.switchMode') }}</span>
    </p>
    <span class="block h-2 overflow-hidden rounded-full bg-ink-950/70" role="meter" :aria-label="t('petanque.power')" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="powerPercent">
      <span class="block h-full rounded-full bg-sun" :style="{ width: `${powerPercent}%` }" />
    </span>
    <p class="m-0 text-mist">{{ t('petanque.howTo') }}</p>
  </div>
</template>
