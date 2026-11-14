<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { raceClock, type PushKind } from '../../game/sports/skating/skateMotion'
import type { SkateRaceRow } from '../../composables/game/useSkating'
import type { SkateResultPayload } from '../../types/gameRealtime'
import type { SkatingBoard } from '../../api/skatingBoard'

defineProps<{
  active: boolean
  speed: number
  cue: number
  rhythmWindow: { from: number; to: number }
  lastPush: PushKind | null
  laps: number | null
  clock: { countdown: number; elapsed: string | null } | null
  rows: SkateRaceRow[]
  result: SkateResultPayload | null
  mySessionId: string | null
  board: SkatingBoard | null
}>()

const { t } = useI18n()
</script>

<template>
  <section
    v-if="active || clock || result || board"
    class="cc-hud pointer-events-none absolute left-1/2 top-24 z-10 w-56 -translate-x-1/2 px-3 py-2 text-xs"
    :aria-label="t('skating.title')"
  >
    <p class="m-0 mb-1 font-display text-[11px] uppercase tracking-[0.16em] text-mint">
      {{ t('skating.title') }}
      <span v-if="clock && clock.countdown > 0" class="text-mist"> · {{ t('skating.startIn', { n: clock.countdown }) }}</span>
      <span v-else-if="clock?.elapsed" class="text-fog"> · {{ clock.elapsed }}</span>
    </p>

    <div v-if="board && !active && !clock && !result" class="flex flex-col gap-1.5">
      <p class="m-0 text-[10px] uppercase tracking-[0.16em] text-mist">{{ t('skating.board.week', { week: board.week }) }}</p>
      <div v-for="lapBoard in board.boards" :key="lapBoard.laps">
        <p class="m-0 font-bold text-fog">{{ t('skating.board.laps', { n: lapBoard.laps }) }}</p>
        <ol v-if="lapBoard.entries.length > 0" class="m-0 flex list-none flex-col gap-0.5 p-0">
          <li v-for="(entry, i) in lapBoard.entries" :key="entry.name" class="flex items-center gap-1.5 text-fog">
            <span class="w-4 text-sun">{{ i + 1 }}</span>
            <span class="min-w-0 flex-1 truncate">{{ entry.name }}</span>
            <span>{{ raceClock(entry.timeMs) }}</span>
          </li>
        </ol>
        <p v-else class="m-0 text-mist">{{ t('skating.board.empty') }}</p>
      </div>
      <div v-if="board.champions.length > 0">
        <p class="m-0 font-bold text-sun">{{ t('skating.board.champions') }}</p>
        <p v-for="champion in board.champions" :key="champion.laps" class="m-0 flex gap-1.5 text-fog">
          <span>{{ t('skating.board.laps', { n: champion.laps }) }}</span>
          <span class="min-w-0 flex-1 truncate">{{ champion.name }}</span>
          <span>{{ raceClock(champion.timeMs) }}</span>
        </p>
      </div>
    </div>

    <ol v-else-if="result" class="m-0 flex list-none flex-col gap-0.5 p-0">
      <li
        v-for="row in [...result.results].sort((a, b) => (a.place ?? 99) - (b.place ?? 99))"
        :key="row.sessionId"
        class="flex items-center gap-1.5 font-bold"
        :class="row.sessionId === mySessionId ? 'text-sun' : 'text-fog'"
      >
        <span class="w-4 text-sun">{{ row.place ?? '–' }}</span>
        <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
        <span>{{ row.timeMs === null ? t('skating.dnf') : raceClock(row.timeMs) }}</span>
        <span v-if="row.penaltyMs > 0" class="text-coral">{{ t('skating.penalty', { s: row.penaltyMs / 1000 }) }}</span>
      </li>
    </ol>

    <ul v-else-if="rows.length > 0" class="m-0 mb-1.5 flex list-none flex-col gap-0.5 p-0">
      <li v-for="row in rows" :key="row.sessionId" class="flex items-center gap-1.5 font-bold" :class="row.mine ? 'text-sun' : 'text-fog'">
        <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
        <span v-if="row.penaltyMs > 0" class="text-coral">{{ t('skating.penalty', { s: row.penaltyMs / 1000 }) }}</span>
        <span>{{ row.status === 'dnf' ? t('skating.dnf') : row.status ?? t('skating.lap', { lap: row.lap, laps }) }}</span>
      </li>
    </ul>

    <div v-if="active && !result" class="flex flex-col gap-1">
      <p class="m-0 flex items-baseline justify-between font-bold text-fog">
        <span class="text-base">{{ t('skating.speed', { n: speed }) }}</span>
        <span v-if="lastPush" :class="lastPush === 'good' ? 'text-sun' : lastPush === 'early' ? 'text-coral' : 'text-mist'">
          {{ t(`skating.push.${lastPush}`) }}
        </span>
      </p>
      <span class="relative block h-1.5 overflow-hidden rounded-full bg-ink-950/70" :aria-label="t('skating.rhythm')">
        <span
          class="absolute inset-y-0 bg-mint/40"
          :style="{ left: `${rhythmWindow.from * 100}%`, width: `${(rhythmWindow.to - rhythmWindow.from) * 100}%` }"
        />
        <span class="absolute inset-y-0 left-0 rounded-full bg-sun" :style="{ width: `${cue * 100}%` }" />
      </span>
      <p class="m-0 text-[10px] text-mist">{{ t('skating.controls') }}</p>
    </div>
  </section>
</template>
