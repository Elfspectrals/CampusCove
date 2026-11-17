<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { useFigureSkating } from '../../composables/game/useFigureSkating'
import type { ElementKind, FigureJudgement } from '../../game/sports/skating/figure'

type Figure = ReturnType<typeof useFigureSkating>

defineProps<{
  hud: Figure['hud']['value']
  board: Figure['board']['value']
  mySessionId: string | null
  keys: Record<ElementKind, string>
}>()

const { t } = useI18n()

const KIND_TONE: Record<ElementKind, string> = { jump: 'border-sun text-sun', spin: 'border-pool text-pool', spiral: 'border-mint text-mint' }
const KIND_FILL: Record<ElementKind, string> = { jump: 'bg-sun', spin: 'bg-pool', spiral: 'bg-mint' }
const JUDGEMENT_TONE: Record<FigureJudgement, string> = { perfect: 'text-sun', good: 'text-mint', miss: 'text-coral' }
</script>

<template>
  <section
    v-if="hud"
    class="cc-hud pointer-events-none absolute left-1/2 top-3 z-[40] w-[min(420px,92vw)] -translate-x-1/2 animate-cc-pop px-3 py-2 text-xs"
    :aria-label="t('sports.figure.title')"
  >
    <p class="m-0 mb-1 flex items-center justify-between font-display text-[11px] uppercase tracking-[0.16em] text-mint">
      <span>{{ t('sports.figure.title') }}</span>
      <span class="font-display text-base tabular-nums text-sun">{{ t('sports.boxing.points', { n: hud.score }) }}</span>
      <span class="font-display text-lg tabular-nums text-fog">{{ hud.countdown ?? hud.secondsLeft }}</span>
    </p>
    <p v-if="hud.countdown !== null" class="m-0 text-center font-display text-sm text-fog">{{ t('sports.figure.countdown', { s: hud.countdown }) }}</p>
    <div v-else-if="hud.prompt" class="flex flex-col gap-1 rounded-lg border-2 px-3 py-1.5" :class="KIND_TONE[hud.prompt.kind]">
      <p class="m-0 flex items-baseline justify-between gap-2">
        <span class="font-display text-lg uppercase">{{ t(`sports.figure.elements.${hud.prompt.kind}`) }}</span>
        <span class="text-[11px] font-bold text-fog">{{ t(`sports.figure.how.${hud.prompt.kind}`, { key: keys[hud.prompt.kind] }) }}</span>
      </p>
      <span class="block h-2.5 overflow-hidden rounded-full bg-ink-950/70">
        <span class="block h-full rounded-full" :class="KIND_FILL[hud.prompt.kind]" :style="{ width: `${hud.prompt.fill * 100}%` }" />
      </span>
      <p class="m-0 h-4 text-[11px] font-bold text-fog">
        <template v-if="hud.prompt.phase === 'coming'">{{ t('sports.figure.coming') }}</template>
        <template v-else-if="hud.prompt.kind === 'spin'">{{ t('sports.figure.spinCount', { n: hud.spinPresses, of: hud.spinGoal }) }}</template>
        <template v-else-if="hud.prompt.kind === 'spiral'">{{ hud.holding ? t('sports.figure.holdOn') : t('sports.figure.holdNow') }}</template>
        <template v-else>{{ t('sports.figure.now') }}</template>
      </p>
    </div>
    <p v-else class="m-0 text-center text-[11px] text-mist">{{ t('sports.figure.glide') }}</p>
    <p class="m-0 mt-1 flex h-5 items-center justify-center gap-2 font-display text-sm" aria-live="polite">
      <span v-if="hud.judged" :key="hud.judged.key" class="animate-cc-pop" :class="JUDGEMENT_TONE[hud.judged.judgement]">
        {{ t(`sports.figure.elements.${hud.judged.element}`) }} · {{ t(`sports.figure.judgement.${hud.judged.judgement}`) }}
      </span>
      <span v-if="hud.turns > 0" class="text-sun">{{ t('sports.figure.turns', { n: hud.turns }) }}</span>
    </p>
    <ul v-if="hud.others.length > 0" class="m-0 mt-1 flex list-none flex-col gap-0.5 rounded-lg bg-ink-950/50 p-1.5">
      <li v-for="other in hud.others" :key="other.sessionId" class="flex justify-between gap-2 font-bold text-fog">
        <span class="min-w-0 truncate">{{ other.name }}</span>
        <span class="tabular-nums">{{ other.score }}</span>
      </li>
    </ul>
  </section>
  <section
    v-else-if="board"
    class="cc-hud pointer-events-none absolute left-1/2 top-3 z-[40] w-[min(360px,92vw)] -translate-x-1/2 animate-cc-pop px-3 py-2"
    :aria-label="t('sports.figure.resultTitle')"
    aria-live="polite"
  >
    <p class="m-0 mb-1 font-display text-[11px] uppercase tracking-[0.16em] text-mint">{{ t('sports.figure.resultTitle') }}</p>
    <ol class="m-0 flex list-none flex-col gap-0.5 p-0">
      <li v-for="row in board" :key="row.sessionId" class="flex items-center gap-2 text-sm font-bold" :class="row.sessionId === mySessionId ? 'text-sun' : 'text-fog'">
        <span class="w-4">{{ row.place ?? '-' }}</span>
        <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
        <span class="tabular-nums">{{ t('sports.boxing.points', { n: row.score }) }}</span>
      </li>
    </ol>
  </section>
</template>
