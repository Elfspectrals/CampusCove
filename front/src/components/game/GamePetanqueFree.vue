<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { PetanqueMode } from '../../game/sports/petanque'
import GamePetanqueThrow from './GamePetanqueThrow.vue'

defineProps<{
  piste: number
  kind: 'jack' | 'boule'
  distances: { id: number; cm: number; point: boolean }[]
  busy: boolean
  mode: PetanqueMode
  power: number | null
}>()

const { t } = useI18n()
</script>

<template>
  <section class="cc-hud pointer-events-none absolute left-1/2 top-3 z-[30] w-[min(300px,92vw)] -translate-x-1/2 p-0 text-xs" :aria-label="t('petanque.free.title')">
    <header class="flex items-center justify-between bg-coral px-3 py-1.5 text-ink-950">
      <span class="font-display text-[11px] uppercase tracking-[0.16em]">{{ t('petanque.free.title') }}</span>
      <span class="font-bold">{{ t('petanque.free.piste', { n: piste }) }}</span>
    </header>
    <div class="flex flex-col gap-2 px-3 py-2">
      <p class="m-0 font-bold text-fog" role="status" aria-live="polite">{{ busy ? t('petanque.waitRoll') : t('petanque.free.hint') }}</p>
      <ol v-if="distances.length > 0" class="m-0 flex list-none flex-col gap-0.5 p-0">
        <li v-for="row in distances" :key="row.id" class="flex items-center gap-1.5 font-bold text-fog">
          <span class="w-4 text-sun">{{ row.point ? '★' : '' }}</span>
          <span class="min-w-0 flex-1">{{ t('petanque.toJack') }}</span>
          <span>{{ t('petanque.cm', { n: row.cm }) }}</span>
        </li>
      </ol>
      <GamePetanqueThrow :kind="kind" :mode="mode" :power="power" />
    </div>
  </section>
</template>
