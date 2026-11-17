<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { formatRaceTime } from '../../game/sports/runningRace'
import type { RunningBoard } from '../../composables/game/useRunningRace'

defineProps<{ board: RunningBoard }>()
const { t } = useI18n()

function title(board: RunningBoard, distanceM: number): string {
  if (board.kind === 'week') return t('sports.running.weekBoard', { m: distanceM, week: board.week })
  return board.kind === 'result' ? t('sports.running.results', { m: distanceM }) : t('sports.running.title', { m: distanceM })
}
</script>

<template>
  <section
    class="cc-hud pointer-events-none absolute z-10 w-52 -translate-x-1/2 -translate-y-full px-3 py-2 text-xs"
    :style="{ left: `${board.x}px`, top: `${board.y}px` }"
    :aria-label="t('sports.running.board')"
  >
    <div v-for="section in board.sections" :key="section.distanceM" class="mb-1 last:mb-0">
      <p class="m-0 mb-1 font-display text-[11px] uppercase tracking-[0.16em] text-mint">{{ title(board, section.distanceM) }}</p>
      <ol class="m-0 flex list-none flex-col gap-1 p-0">
        <li v-for="row in section.rows" :key="row.sessionId" class="flex flex-col gap-0.5">
          <span class="flex items-center gap-1.5 font-bold text-fog">
            <span class="w-4 text-sun">{{ row.place ?? '–' }}</span>
            <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
            <span v-if="row.status.kind === 'time'" class="tabular-nums">{{ formatRaceTime(row.status.ms) }}</span>
            <span v-else-if="row.status.kind === 'dnf'" class="text-coral">{{ t(`sports.running.dnfShort.${row.status.dnf}`) }}</span>
            <span v-else class="tabular-nums">{{ row.status.percent }}%</span>
          </span>
          <span v-if="row.status.kind === 'progress'" class="block h-1 overflow-hidden rounded-full bg-ink-950/70">
            <span class="block h-full rounded-full bg-sun transition-[width] duration-200" :style="{ width: `${row.status.percent}%` }" />
          </span>
        </li>
        <li v-if="section.rows.length === 0" class="text-mist">{{ t('sports.running.nobody') }}</li>
      </ol>
    </div>
  </section>
</template>
