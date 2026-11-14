<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { cadenceBar, formatRaceTime, raceClockMs } from '../../game/sports/runningRace'
import type { SportsRunResultPayload, SportsRunStatePayload, SportsRunner } from '../../types/gameRealtime'

const props = defineProps<{
  state: SportsRunStatePayload | null
  runner: SportsRunner | null
  result: SportsRunResultPayload | null
  clientNow: number
  clockOffset: number
  lastStepAt: number | null
  gateBearing: number | null
}>()

const { t } = useI18n()

const serverNow = computed(() => props.clientNow + props.clockOffset)
const clock = computed(() => {
  if (!props.state) return null
  if (props.runner?.timeMs != null) return formatRaceTime(props.runner.timeMs)
  const ms = raceClockMs(props.state, serverNow.value)
  return ms === null ? null : formatRaceTime(ms)
})
const phaseText = computed(() => {
  const runner = props.runner
  if (!props.state || !runner) return ''
  if (runner.state === 'dnf') return t(`sports.running.dnf.${runner.dnf ?? 'left'}`)
  if (runner.state === 'finished') return t('sports.running.finished')
  if (props.state.phase === 'marks') return t('sports.running.marks')
  if (props.state.phase === 'set') return t('sports.running.set')
  return props.state.laps > 1 ? t('sports.running.lap', { n: runner.lap, laps: props.state.laps }) : ''
})
const running = computed(() => props.state?.phase === 'running' && props.runner?.state === 'running')
const bar = computed(() =>
  props.state ? cadenceBar(props.state.goodStepMs, props.state.toleranceMs, props.lastStepAt === null ? null : props.clientNow - props.lastStepAt) : null,
)
const arrowDeg = computed(() => (props.gateBearing === null ? null : (-props.gateBearing * 180) / Math.PI))
</script>

<template>
  <div v-if="state && runner" class="pointer-events-none absolute inset-x-0 top-16 z-20 flex flex-col items-center gap-2">
    <section class="cc-hud flex min-w-48 flex-col items-center px-4 py-2" aria-live="polite">
      <span class="font-display text-[11px] uppercase tracking-[0.16em] text-mint">{{ t('sports.running.title', { m: state.distanceM }) }}</span>
      <span v-if="clock" class="font-display text-2xl tabular-nums text-fog">{{ clock }}</span>
      <span v-if="phaseText" class="text-sm font-bold text-sun">{{ phaseText }}</span>
    </section>
    <span
      v-if="running && arrowDeg !== null"
      class="font-display text-3xl text-sun drop-shadow"
      :style="{ transform: `rotate(${arrowDeg}deg)` }"
      :aria-label="t('sports.running.nextGate')"
    >▲</span>
  </div>
  <div v-if="state && runner && running && bar" class="pointer-events-none absolute inset-x-0 bottom-28 z-20 flex flex-col items-center gap-1">
    <div class="relative h-3 w-[min(320px,80vw)] overflow-hidden rounded-full bg-ink-950/70" role="presentation">
      <span
        class="absolute inset-y-0 bg-mint/60"
        :style="{ left: `${bar.windowStart * 100}%`, width: `${(bar.windowEnd - bar.windowStart) * 100}%` }"
      />
      <span class="absolute inset-y-0 w-1 -translate-x-1/2" :class="bar.inWindow ? 'bg-sun' : 'bg-fog'" :style="{ left: `${bar.marker * 100}%` }" />
    </div>
    <span class="cc-hud px-2 py-0.5 text-xs text-mist">{{ t('sports.running.hint') }}</span>
  </div>
  <section v-if="result" class="cc-hud pointer-events-none absolute left-1/2 top-16 z-20 w-64 -translate-x-1/2 px-4 py-3 text-sm" aria-live="polite">
    <p class="m-0 mb-2 font-display text-[11px] uppercase tracking-[0.16em] text-mint">{{ t('sports.running.results', { m: result.distanceM }) }}</p>
    <ol class="m-0 flex list-none flex-col gap-1 p-0">
      <li v-for="row in result.results" :key="row.sessionId" class="flex items-center gap-2 font-bold text-fog">
        <span class="w-5 text-sun">{{ row.place ?? '–' }}</span>
        <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
        <span v-if="row.timeMs !== undefined" class="tabular-nums">{{ formatRaceTime(row.timeMs) }}</span>
        <span v-else class="text-coral">{{ t(`sports.running.dnfShort.${row.dnf ?? 'left'}`) }}</span>
      </li>
    </ol>
  </section>
</template>
