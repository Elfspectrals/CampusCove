<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { usePoolRace } from '../../composables/game/usePoolRace'
import type { usePoolSwim } from '../../composables/game/usePoolSwim'
import type { FallingStroke, NoteKind, StrokeResult } from '../../game/sports/pool/poolRace'

type PoolRace = ReturnType<typeof usePoolRace>

defineProps<{
  hud: PoolRace['hud']['value']
  board: PoolRace['board']['value']
  trickLine: string | null
  breath?: ReturnType<typeof usePoolSwim>['breathHud']['value']
  underwater?: boolean
}>()

const { t } = useI18n()

const LANES: { kind: NoteKind; colour: string }[] = [
  { kind: 'left', colour: '#38c6f4' },
  { kind: 'breath', colour: '#ffd23f' },
  { kind: 'right', colour: '#ff5fa2' },
]
const LANE_PX = 56
const HIGHWAY_PX = 240
const LINE_PX = 200
const judgementClass: Partial<Record<StrokeResult, string>> = { perfect: 'text-sun', good: 'text-mint', miss: 'text-coral', stray: 'text-coral' }

function laneLabel(kind: NoteKind): string {
  return kind === 'breath' ? t('sports.pool.air') : kind === 'left' ? '←' : '→'
}

function noteStyle(note: FallingStroke): Record<string, string> {
  const lane = LANES.findIndex((l) => l.kind === note.kind)
  return { left: `${lane * LANE_PX + 6}px`, top: `${note.progress * LINE_PX - 14}px`, background: LANES[lane]!.colour }
}
</script>

<template>
  <div v-if="underwater" class="pool-underwater pointer-events-none absolute inset-0 z-[5]" aria-hidden="true" />
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
      <p v-else-if="hud.phase === 'swimming'" class="m-0 mt-1 text-mist">{{ t('sports.pool.strokeHint') }}</p>
      <p v-else-if="hud.phase === 'finished'" class="m-0 mt-1 font-bold text-mint">{{ t('sports.pool.finished', { time: hud.time }) }}</p>
      <p v-else class="m-0 mt-1 font-bold text-coral">{{ t(`sports.pool.status.${hud.phase}`) }}</p>
      <p v-if="hud.reaction" class="m-0 mt-1 text-mist">{{ t('sports.pool.reaction', { time: hud.reaction }) }}</p>
    </section>

    <p v-if="trickLine" class="cc-hud m-0 px-3 py-1 text-xs font-bold text-sun">{{ trickLine }}</p>
  </div>
  <section v-if="hud && (hud.phase === 'swimming' || hud.notes.length > 0)" class="cc-hud pointer-events-none absolute bottom-28 left-1/2 z-10 ml-44 p-2" :aria-label="t('sports.pool.notes')">
    <div class="relative overflow-hidden rounded-lg border-2 border-line/15 bg-ink-950/80" :style="{ width: `${LANES.length * LANE_PX}px`, height: `${HIGHWAY_PX}px` }">
      <div
        v-for="(lane, i) in LANES"
        :key="`col-${lane.kind}`"
        class="absolute inset-y-0 border-r border-line/10 transition-colors"
        :style="{ left: `${i * LANE_PX}px`, width: `${LANE_PX}px`, background: hud.lit[lane.kind] ? `${lane.colour}33` : 'transparent' }"
      />
      <div class="absolute inset-x-0 h-1 bg-white/70" :style="{ top: `${LINE_PX}px` }" />
      <div
        v-for="(lane, i) in LANES"
        :key="`target-${lane.kind}`"
        class="absolute flex size-11 items-center justify-center rounded-full border-2 text-xs font-bold"
        :style="{ left: `${i * LANE_PX + 6}px`, top: `${LINE_PX - 20}px`, borderColor: lane.colour, color: lane.colour }"
      >
        {{ laneLabel(lane.kind) }}
      </div>
      <div v-for="note in hud.notes" :key="note.index" class="absolute flex h-7 w-11 items-center justify-center rounded-md text-xs font-bold text-ink-950" :style="noteStyle(note)">
        {{ laneLabel(note.kind) }}
      </div>
    </div>
    <p class="m-0 mt-1 h-6 text-center font-display text-lg" :class="hud.judgement ? judgementClass[hud.judgement] : ''">
      {{ hud.judgement ? t(`sports.pool.stroke.${hud.judgement}`) : '' }}
    </p>
  </section>
  <section v-if="breath" class="cc-hud pointer-events-none absolute bottom-40 left-1/2 z-10 w-48 -translate-x-1/2 px-3 py-1.5 text-xs" :aria-label="t('sports.pool.breath')">
    <p class="m-0 mb-1 flex justify-between font-bold" :class="breath.low ? 'text-coral' : 'text-fog'">
      <span>{{ t('sports.pool.breath') }}</span>
      <span class="tabular-nums">{{ Math.ceil(breath.fill * 100) }}%</span>
    </p>
    <span class="block h-2 overflow-hidden rounded-full bg-ink-950/70" role="meter" :aria-valuenow="Math.ceil(breath.fill * 100)" aria-valuemin="0" aria-valuemax="100">
      <span class="block h-full rounded-full transition-[width] duration-200" :class="breath.low ? 'bg-coral' : 'bg-mint'" :style="{ width: `${breath.fill * 100}%` }" />
    </span>
  </section>
</template>

<style scoped>
.pool-underwater {
  background: radial-gradient(ellipse at center, rgb(40 150 180 / 0.18) 0%, rgb(10 60 80 / 0.45) 100%);
}
</style>
