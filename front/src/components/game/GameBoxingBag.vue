<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { BagOutcome, BagStep } from '../../game/sports/boxing'

defineProps<{
  round: {
    clock: string
    comboName: string
    steps: BagStep[]
    score: number
    combos: number
    streak: number
    outcome: BagOutcome
    key: number
    doubleFrom: number
  } | null
  result: { score: number; combos: number } | null
}>()

const { t } = useI18n()

const STEP_TONE: Record<BagStep['state'], string> = {
  done: 'border-mint bg-mint/20 text-mint',
  next: 'border-sun bg-sun text-ink-950',
  todo: 'border-line/30 text-mist',
}
const OUTCOME_TONE: Record<BagOutcome, string> = { hit: 'text-mint', combo: 'text-sun', wrong: 'text-coral', late: 'text-coral', over: 'text-mist' }
</script>

<template>
  <section
    v-if="round"
    class="cc-hud pointer-events-none absolute left-1/2 top-3 z-[40] w-[min(460px,92vw)] -translate-x-1/2 animate-cc-pop px-3 py-2 text-xs"
    :aria-label="t('sports.boxing.bag.title')"
  >
    <p class="m-0 mb-1.5 flex items-center justify-between font-display text-[11px] uppercase tracking-[0.16em] text-mint">
      <span>{{ t('sports.boxing.bag.title') }} · {{ round.comboName }}</span>
      <span class="font-display text-lg tabular-nums text-fog">{{ round.clock }}</span>
    </p>
    <ol class="m-0 flex list-none flex-wrap gap-1.5 p-0">
      <li v-for="(step, i) in round.steps" :key="i" class="flex min-w-[5.5rem] flex-1 flex-col items-center rounded-lg border-2 px-2 py-1 leading-tight" :class="STEP_TONE[step.state]">
        <span class="font-display text-sm uppercase">{{ t(`sports.boxing.bag.punches.${step.kind}`) }}</span>
        <span class="text-[10px] font-bold">{{ t(`sports.boxing.bag.inputs.${step.kind}`) }}</span>
      </li>
    </ol>
    <p class="m-0 mt-1.5 flex items-center justify-between font-bold text-fog">
      <span class="font-display text-base text-sun tabular-nums">{{ t('sports.boxing.points', { n: round.score }) }}</span>
      <span>{{ t('sports.boxing.bag.combos', { n: round.combos }) }}</span>
      <span :class="round.streak >= round.doubleFrom ? 'text-sun' : 'text-mist'">{{ round.streak >= round.doubleFrom ? t('sports.boxing.bag.double') : t('sports.boxing.bag.streak', { n: round.streak, of: round.doubleFrom }) }}</span>
    </p>
    <p :key="round.key" class="m-0 mt-1 h-5 animate-cc-pop text-center font-display text-sm" :class="OUTCOME_TONE[round.outcome]" aria-live="polite">
      {{ t(`sports.boxing.bag.outcome.${round.outcome}`) }}
    </p>
    <p class="m-0 text-[10px] text-mist">{{ t('sports.boxing.bag.hint') }}</p>
  </section>
  <section
    v-else-if="result"
    class="cc-hud pointer-events-none absolute left-1/2 top-3 z-[40] w-[min(360px,92vw)] -translate-x-1/2 animate-cc-pop px-3 py-2 text-center"
    :aria-label="t('sports.boxing.bag.title')"
    aria-live="polite"
  >
    <p class="m-0 font-display text-[11px] uppercase tracking-[0.16em] text-mint">{{ t('sports.boxing.bag.over') }}</p>
    <p class="m-0 font-display text-2xl text-sun tabular-nums">{{ t('sports.boxing.points', { n: result.score }) }}</p>
    <p class="m-0 text-xs font-bold text-fog">{{ t('sports.boxing.bag.combos', { n: result.combos }) }}</p>
  </section>
</template>
