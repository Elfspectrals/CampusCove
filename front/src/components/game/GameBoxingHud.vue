<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { BoxingCallout, BoxingCombo, BoxingCorner, BoxingMethod, BoxingPhase } from '../../game/sports/boxing'

interface BoxerRow {
  key: string
  name: string
  corner: BoxingCorner
  isMe: boolean
  health: number
  endurance: number
  guard: boolean
  stunned: boolean
  counter: boolean
  weary: boolean
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
    combo: { id: BoxingCombo; name: string; mine: boolean; damage: number; key: number } | null
    callout: { kind: BoxingCallout; mine: boolean; key: number } | null
  }
  fighting: boolean
  guardKey: string
  dodgeKeys: readonly string[]
}>()

const { t } = useI18n()
const me = computed(() => props.view.boxers.find((b) => b.isMe) ?? null)
const resultText = computed(() => {
  const result = props.view.result
  if (!result) return null
  if (result.method === 'draw' || result.winner === null) return t('sports.boxing.result.draw')
  return t(`sports.boxing.result.${result.method}`, { name: result.winner })
})
const moves = computed(() => [
  { keys: [t('sports.boxing.keys.leftClick')], tap: t('sports.boxing.bag.punches.jab'), hold: t('sports.boxing.bag.punches.hook') },
  { keys: [t('sports.boxing.keys.rightClick')], tap: t('sports.boxing.bag.punches.cross'), hold: t('sports.boxing.bag.punches.uppercut') },
  { keys: [props.guardKey], tap: t('sports.boxing.keys.parry'), hold: t('sports.boxing.guard') },
  { keys: props.dodgeKeys, tap: t('sports.boxing.keys.dodge'), hold: null },
])
const status = computed(() => {
  const mine = me.value
  if (!mine || !props.fighting) return null
  if (mine.stunned) return { text: t('sports.boxing.status.stunned'), tone: 'text-coral' }
  if (mine.counter) return { text: t('sports.boxing.status.counter'), tone: 'text-mint' }
  if (mine.weary) return { text: t('sports.boxing.status.weary'), tone: 'text-sun' }
  return null
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
          <span v-if="boxer.stunned" class="text-coral">{{ t('sports.boxing.stunned') }}</span>
          <span v-else-if="boxer.guard" class="text-mint">{{ t('sports.boxing.guard') }}</span>
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
    <p
      v-if="view.combo"
      :key="view.combo.key"
      class="m-0 mt-2 animate-cc-pop font-display text-base"
      :class="view.combo.mine ? 'text-sun' : 'text-coral'"
      aria-live="polite"
    >
      {{ t('sports.boxing.comboCallout', { name: view.combo.name, damage: view.combo.damage }) }}
    </p>
    <p
      v-if="view.callout"
      :key="`callout-${view.callout.key}`"
      class="m-0 mt-2 animate-cc-pop font-display text-lg uppercase tracking-[0.08em]"
      :class="view.callout.mine ? 'text-mint' : 'text-coral'"
      aria-live="polite"
    >
      {{ t(`sports.boxing.callout.${view.callout.kind}`) }}
    </p>
    <p v-if="status && !resultText" class="m-0 mt-1 font-display text-sm" :class="status.tone" aria-live="polite">{{ status.text }}</p>
    <p v-if="resultText" class="m-0 mt-2 font-display text-base text-sun" aria-live="polite">{{ resultText }}</p>
    <p v-else-if="me && me.countLeft !== null" class="m-0 mt-2 font-display text-sm text-fog">
      {{ me.canGetUp ? t('sports.boxing.getUp') : t('sports.boxing.stayDown') }}
    </p>
    <div v-else-if="fighting" class="mt-2 flex flex-col gap-1.5">
      <ul class="m-0 grid list-none grid-cols-2 gap-x-3 gap-y-1.5 p-0">
        <li v-for="move in moves" :key="move.tap" class="flex items-center gap-1.5">
          <span v-for="key in move.keys" :key="key" class="rounded-md border-2 border-line/30 bg-ink-950/90 px-1.5 py-0.5 text-[11px] font-bold uppercase leading-none text-fog">{{ key }}</span>
          <span class="min-w-0 leading-tight text-fog">
            {{ move.tap }}<span v-if="move.hold" class="block text-[10px] text-mist">{{ t('sports.boxing.keys.held', { move: move.hold }) }}</span>
          </span>
        </li>
      </ul>
      <p class="m-0 text-[10px] leading-snug text-mist">{{ t('sports.boxing.tips') }}</p>
    </div>
  </section>
</template>
