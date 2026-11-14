<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { usePoolRace } from '../../composables/game/usePoolRace'

type PoolRace = ReturnType<typeof usePoolRace>

defineProps<{
  hud: PoolRace['hud']['value']
  board: PoolRace['board']['value']
  trickLine: string | null
}>()

const { t } = useI18n()
</script>

<template>
  <div class="pointer-events-none absolute inset-x-0 top-16 z-10 flex flex-col items-center gap-2 px-4">
    <section v-if="board" class="cc-hud w-56 px-3 py-2 text-xs" :aria-label="t('sports.pool.boardTitle')">
      <p class="m-0 mb-1 font-display text-[11px] uppercase tracking-[0.16em] text-mint">
        {{ t('sports.pool.boardTitle') }}<span class="text-mist"> · {{ board.distanceM }} m</span>
      </p>
      <ol class="m-0 flex list-none flex-col gap-1 p-0">
        <li v-for="row in board.rows" :key="row.sessionId" class="flex flex-col gap-0.5">
          <span class="flex items-center gap-1.5 font-bold text-fog">
            <span class="w-4 text-sun">{{ board.done ? (row.place ?? '-') : row.lane }}</span>
            <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
            <span v-if="row.status === 'disqualified'" class="text-coral">{{ t('sports.pool.status.disqualified') }}</span>
            <span v-else-if="row.status === 'dnf'" class="text-coral">{{ t('sports.pool.status.dnf') }}</span>
            <span v-else-if="board.done || row.status === 'finished'">{{ row.time }}</span>
            <span v-else>{{ row.percent }}%</span>
          </span>
          <span v-if="!board.done" class="block h-1 overflow-hidden rounded-full bg-ink-950/70">
            <span class="block h-full rounded-full bg-sun transition-[width] duration-200" :style="{ width: `${row.percent}%` }" />
          </span>
        </li>
      </ol>
    </section>

    <section v-if="hud" class="cc-hud w-64 px-3 py-2 text-xs" :aria-label="t('sports.pool.hudTitle')">
      <p class="m-0 flex items-center justify-between font-bold text-fog">
        <span>{{ t('sports.pool.lane', { lane: hud.lane }) }}</span>
        <span>{{ t('sports.pool.length', { length: hud.length, lengths: hud.lengths }) }}</span>
        <span class="font-display text-sm text-sun tabular-nums">{{ hud.clock }}</span>
      </p>
      <p v-if="hud.phase === 'marks'" class="m-0 mt-1 text-mist">{{ t('sports.pool.marksHint') }}</p>
      <template v-else-if="hud.phase === 'swimming'">
        <span class="relative mt-2 block h-2.5 overflow-hidden rounded-full bg-ink-950/70" role="meter" :aria-label="t('sports.pool.cadence')">
          <span class="absolute inset-y-0 bg-mint/40" :style="{ left: `${hud.cadence.windowFrom * 100}%`, width: `${(hud.cadence.windowTo - hud.cadence.windowFrom) * 100}%` }" />
          <span class="absolute inset-y-0 left-0 rounded-full" :class="hud.cadence.inWindow ? 'bg-mint' : 'bg-sun'" :style="{ width: `${hud.cadence.fill * 100}%` }" />
        </span>
        <p class="m-0 mt-1 flex justify-between text-mist">
          <span>{{ t('sports.pool.strokeHint') }}</span>
          <span v-if="hud.stroke === 'off'" class="font-bold text-coral">{{ t('sports.pool.stroke.off') }}</span>
          <span v-else-if="hud.stroke === 'good'" class="font-bold text-mint">{{ t('sports.pool.stroke.good') }}</span>
          <span v-else-if="hud.stroke === 'slow'" class="font-bold text-sun">{{ t('sports.pool.stroke.slow') }}</span>
        </p>
      </template>
      <p v-else-if="hud.phase === 'finished'" class="m-0 mt-1 font-bold text-mint">{{ t('sports.pool.finished', { time: hud.time }) }}</p>
      <p v-else class="m-0 mt-1 font-bold text-coral">{{ t(`sports.pool.status.${hud.phase}`) }}</p>
      <p v-if="hud.reaction" class="m-0 mt-1 text-mist">{{ t('sports.pool.reaction', { time: hud.reaction }) }}</p>
    </section>

    <p v-if="trickLine" class="cc-hud m-0 px-3 py-1 text-xs font-bold text-sun">{{ trickLine }}</p>
  </div>
</template>
