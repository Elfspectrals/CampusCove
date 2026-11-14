<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { DANCE_LANES, type DanceEnd, type DanceMode, type FallingNote, type Judgement } from '../../game/sports/danceHud'
import type { DancerScore } from '../../composables/game/useDance'

const props = defineProps<{
  mode: DanceMode
  song: string
  dancing: boolean
  songMs: number
  notes: FallingNote[]
  board: DancerScore[]
  mine: DancerScore | null
  teamScore: number | null
  judgement: { judgement: Judgement; synced: boolean } | null
  litLanes: boolean[]
  result: DanceEnd | null
  reducedEffects: boolean
}>()

const { t, te } = useI18n()

const LANE_COLOURS = ['#ff5fa2', '#38c6f4', '#ffd23f', '#5fd068']
const LANE_ARROWS = ['←', '↓', '↑', '→']
const HIGHWAY_PX = 300
const LINE_PX = 260

const lanes = Array.from({ length: DANCE_LANES }, (_, i) => i)
const songName = computed(() => (te(`sports.options.${props.song}`) ? t(`sports.options.${props.song}`) : props.song))
const countdown = computed(() => Math.max(0, Math.ceil(-props.songMs / 1000)))
const others = computed(() => props.board.filter((d) => !d.me))
const judgementClass: Record<Judgement, string> = { perfect: 'text-sun', good: 'text-mint', miss: 'text-coral' }
const resultRows = computed(() => [...(props.result?.dancers ?? [])].sort((a, b) => b.score - a.score))

function noteTop(note: FallingNote): string {
  return `${note.progress * LINE_PX - 14}px`
}

function resultLabel(row: DanceEnd['dancers'][number]): string {
  if (row.result === 'dnf') return t('sports.dance.left')
  if (props.result?.mode === 'duel' && row.place !== null) return t('sports.dance.place', { n: row.place })
  return ''
}
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-[35] flex items-end justify-center pb-24 select-none">
    <section v-if="!result" class="cc-hud pointer-events-auto flex animate-cc-pop items-stretch gap-4 p-3" :aria-label="t('sports.dance.title')">
      <div class="relative overflow-hidden rounded-lg border-2 border-line/15 bg-ink-950/80" :style="{ width: `${DANCE_LANES * 56}px`, height: `${HIGHWAY_PX}px` }">
        <div
          v-for="lane in lanes"
          :key="`col-${lane}`"
          class="absolute inset-y-0 border-r border-line/10 transition-colors"
          :style="{ left: `${lane * 56}px`, width: '56px', background: litLanes[lane] ? `${LANE_COLOURS[lane]}33` : 'transparent' }"
        />
        <div class="absolute inset-x-0 h-1 bg-white/70" :style="{ top: `${LINE_PX}px` }" />
        <div
          v-for="lane in lanes"
          :key="`target-${lane}`"
          class="absolute flex size-11 items-center justify-center rounded-full border-2 text-lg font-bold"
          :style="{ left: `${lane * 56 + 6}px`, top: `${LINE_PX - 20}px`, borderColor: LANE_COLOURS[lane], color: LANE_COLOURS[lane] }"
        >
          {{ LANE_ARROWS[lane] }}
        </div>
        <div
          v-for="note in notes"
          :key="note.index"
          class="absolute flex h-7 w-11 items-center justify-center rounded-md text-sm font-bold text-ink-950"
          :class="reducedEffects ? '' : 'shadow-[0_0_10px_rgb(255_255_255/0.35)]'"
          :style="{ left: `${note.lane * 56 + 6}px`, top: noteTop(note), background: LANE_COLOURS[note.lane] }"
        >
          {{ LANE_ARROWS[note.lane] }}
        </div>
        <p v-if="countdown > 0" class="absolute inset-x-0 top-1/3 m-0 text-center font-display text-4xl text-sun">{{ countdown }}</p>
      </div>
      <div class="flex w-48 flex-col gap-2">
        <p class="m-0 font-display text-sm uppercase tracking-[0.16em] text-mist">{{ songName }}</p>
        <p class="m-0 font-display text-3xl text-fog">{{ mine?.score ?? 0 }}</p>
        <p class="m-0 text-sm font-bold text-mist">{{ t('sports.dance.combo', { n: mine?.combo ?? 0 }) }}</p>
        <p v-if="judgement" :key="`${judgement.judgement}-${songMs}`" class="m-0 font-display text-2xl" :class="[judgementClass[judgement.judgement], reducedEffects ? '' : 'animate-cc-pop']">
          {{ t(`sports.dance.judgements.${judgement.judgement}`) }}
        </p>
        <p v-if="judgement?.synced" class="m-0 text-xs font-bold text-sun">{{ t('sports.dance.sync') }}</p>
        <p v-if="mode === 'team' && teamScore !== null" class="m-0 text-sm font-bold text-fog">{{ t('sports.dance.teamScore', { n: teamScore }) }}</p>
        <ul v-if="mode === 'duel' && others.length" class="m-0 flex list-none flex-col gap-1 rounded-lg bg-ink-950/50 p-2">
          <li v-for="d in others" :key="d.sessionId" class="flex justify-between gap-2 text-xs font-bold text-fog">
            <span class="min-w-0 truncate">{{ d.name }}</span>
            <span>{{ d.score }}</span>
          </li>
        </ul>
        <p v-if="!dancing" class="m-0 text-xs text-mist">{{ t('sports.dance.watching') }}</p>
        <p v-else class="m-0 text-xs text-mist">{{ t('sports.dance.keys') }}</p>
      </div>
    </section>
    <section v-else class="cc-hud pointer-events-auto w-[min(420px,94vw)] animate-cc-pop overflow-hidden p-0" :aria-label="t('sports.dance.resultTitle')">
      <header class="flex items-center justify-between bg-mint px-4 py-2 text-ink-950">
        <span class="font-display text-sm uppercase tracking-[0.18em]">{{ t('sports.dance.resultTitle') }}</span>
        <span class="text-xs font-bold">{{ songName }}</span>
      </header>
      <div class="flex flex-col gap-2 px-4 py-3">
        <p v-if="result.mode === 'team' && result.teamScore !== null" class="m-0 font-display text-xl text-fog">{{ t('sports.dance.teamScore', { n: result.teamScore }) }}</p>
        <ol class="m-0 flex list-none flex-col gap-1 p-0">
          <li v-for="row in resultRows" :key="row.sessionId" class="flex items-center gap-2 text-sm font-bold text-fog">
            <span class="min-w-0 flex-1 truncate">{{ row.name }}</span>
            <span class="text-xs text-mist">{{ resultLabel(row) }}</span>
            <span v-if="row.fullCombo" class="text-xs text-sun">{{ t('sports.dance.fullCombo') }}</span>
            <span>{{ row.score }}</span>
          </li>
        </ol>
        <p class="m-0 text-xs text-mist">{{ t('sports.dance.closeHint') }}</p>
      </div>
    </section>
  </div>
</template>
