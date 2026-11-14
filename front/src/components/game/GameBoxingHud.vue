<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BoxingCorner, BoxingMethod, BoxingPhase } from '../../game/sports/boxing'

interface BoxerRow {
  key: string
  name: string
  corner: BoxingCorner
  isMe: boolean
  health: number
  endurance: number
  guard: boolean
  knockdowns: number
  points: number
  countLeft: number | null
  canGetUp: boolean
}

const props = defineProps<{
  view: {
    phase: BoxingPhase
    round: number
    rounds: number
    maxKnockdowns: number
    clock: string
    boxers: BoxerRow[]
    result: { method: BoxingMethod; winner: string | null; won: boolean } | null
  }
  fighting: boolean
  guardKey: string
}>()

const { t } = useI18n()
const me = computed(() => props.view.boxers.find((b) => b.isMe) ?? null)
const resultText = computed(() => {
  const result = props.view.result
  if (!result) return null
  if (result.method === 'draw' || result.winner === null) return t('sports.boxing.result.draw')
  return t(`sports.boxing.result.${result.method}`, { name: result.winner })
})
</script>

<template>
  <section
    class="cc-hud pointer-events-none absolute left-1/2 top-3 z-[40] w-[min(420px,92vw)] -translate-x-1/2 animate-cc-pop px-3 py-2 text-xs"
    :aria-label="t('sports.boxing.title')"
  >
    <p class="m-0 mb-1.5 flex items-center justify-between font-display text-[11px] uppercase tracking-[0.16em] text-mint">
      <span>{{ t(`sports.boxing.phase.${view.phase}`, { round: view.round, rounds: view.rounds }) }}</span>
      <span v-if="view.phase !== 'over'" class="font-display text-lg tabular-nums text-fog">{{ view.clock }}</span>
    </p>
    <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
      <li v-for="boxer in view.boxers" :key="boxer.key" class="flex flex-col gap-0.5">
        <span class="flex items-center gap-1.5 font-bold text-fog">
          <span class="h-2.5 w-2.5 shrink-0 rounded-full" :class="boxer.corner === 'red' ? 'bg-coral' : 'bg-pool'" />
          <span class="min-w-0 flex-1 truncate">{{ boxer.name }}<span v-if="boxer.isMe" class="text-mist"> · {{ t('sports.boxing.you') }}</span></span>
          <span v-if="boxer.guard" class="text-mint">{{ t('sports.boxing.guard') }}</span>
          <span class="text-sun" :aria-label="t('sports.boxing.knockdowns', { n: boxer.knockdowns })">{{ '●'.repeat(boxer.knockdowns) }}{{ '○'.repeat(Math.max(0, view.maxKnockdowns - boxer.knockdowns)) }}</span>
          <span class="tabular-nums">{{ t('sports.boxing.points', { n: boxer.points }) }}</span>
        </span>
        <span class="block h-1.5 overflow-hidden rounded-full bg-ink-950/70" :aria-label="t('sports.boxing.health')">
          <span class="block h-full rounded-full bg-coral transition-[width] duration-200" :style="{ width: `${boxer.health}%` }" />
        </span>
        <span class="block h-1 overflow-hidden rounded-full bg-ink-950/70" :aria-label="t('sports.boxing.endurance')">
          <span class="block h-full rounded-full bg-sun transition-[width] duration-200" :style="{ width: `${boxer.endurance}%` }" />
        </span>
        <span v-if="boxer.countLeft !== null" class="font-display text-sm text-coral" aria-live="polite">
          {{ t('sports.boxing.down', { s: boxer.countLeft }) }}
        </span>
      </li>
    </ul>
    <p v-if="resultText" class="m-0 mt-2 font-display text-base text-sun" aria-live="polite">{{ resultText }}</p>
    <p v-else-if="me && me.countLeft !== null" class="m-0 mt-2 font-display text-sm text-fog">
      {{ me.canGetUp ? t('sports.boxing.getUp') : t('sports.boxing.stayDown') }}
    </p>
    <p v-else-if="fighting" class="m-0 mt-2 text-[11px] text-mist">{{ t('sports.boxing.controls', { guard: guardKey }) }}</p>
  </section>
</template>
