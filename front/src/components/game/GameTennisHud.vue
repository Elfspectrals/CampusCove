<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TennisCall, TennisHud } from '../../composables/game/useTennis'
import { TENNIS_GAUGE_FULL as GAUGE_FULL } from '../../game/sports/tennis'
import type { TennisTiming } from '../../types/gameRealtime'

defineProps<{ hud: TennisHud | null; cue: boolean; call: TennisCall; timing: TennisTiming | null; freePlay: boolean }>()
const { t } = useI18n()
const TEAMS = ['red', 'blue'] as const
const TIMING_TONE: Record<TennisTiming, string> = { smash: 'text-grape', perfect: 'text-mint', good: 'text-sun', early: 'text-coral', late: 'text-coral' }
</script>

<template>
  <section v-if="hud" class="cc-hud pointer-events-none absolute left-1/2 top-3 z-10 w-56 -translate-x-1/2 px-3 py-2 text-xs" :aria-label="t('sports.tennis.board')">
    <p class="m-0 mb-1 font-display text-[11px] uppercase tracking-[0.16em] text-mint">
      {{ t('sports.sports.tennis') }}<span v-if="hud.tiebreak" class="text-mist"> · {{ t('sports.tennis.tiebreak') }}</span>
    </p>
    <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
      <li v-for="team in TEAMS" :key="team" class="flex items-center gap-1.5 font-bold text-fog">
        <span class="w-3 text-sun">{{ hud.serving === team ? '●' : '' }}</span>
        <span class="min-w-0 flex-1 truncate" :class="team === 'red' ? 'text-coral' : 'text-pool'">
          {{ t(`sports.teams.${team}`) }}<span v-if="hud.myTeam === team" class="text-mist"> · {{ t('sports.tennis.you') }}</span>
        </span>
        <span class="w-5 text-right">{{ hud.games[team] }}</span>
        <span class="w-7 text-right text-sun">{{ hud.points[team] }}</span>
      </li>
    </ul>
    <div v-if="hud.gauge !== null && !hud.winner" class="mt-1.5">
      <p class="m-0 flex justify-between font-bold" :class="hud.armed ? 'text-grape' : hud.gauge >= GAUGE_FULL ? 'text-sun' : 'text-mist'">
        <span>{{ t('sports.tennis.cove.special') }}</span>
        <span>{{ hud.armed ? t('sports.tennis.cove.armed') : hud.gauge >= GAUGE_FULL ? t('sports.tennis.cove.ready') : `${hud.gauge} %` }}</span>
      </p>
      <div class="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ink-950/60" role="meter" :aria-valuenow="hud.gauge" aria-valuemin="0" :aria-valuemax="GAUGE_FULL" :aria-label="t('sports.tennis.cove.special')">
        <div class="h-full rounded-full transition-[width] duration-300" :class="hud.armed ? 'bg-grape' : 'bg-sun'" :style="{ width: `${hud.gauge}%` }" />
      </div>
    </div>
    <p v-if="hud.winner" class="m-0 mt-1 font-bold text-sun">
      {{ hud.myTeam === null ? t('sports.tennis.winner', { team: t(`sports.teams.${hud.winner}`) }) : hud.myTeam === hud.winner ? t('sports.tennis.won') : t('sports.tennis.lost') }}
    </p>
    <p v-else-if="hud.iServe" class="m-0 mt-1 text-mist">{{ hud.tossing ? t('sports.tennis.hitToss') : t('sports.tennis.serve') }}</p>
  </section>
  <section v-else-if="freePlay" class="cc-hud pointer-events-none absolute left-1/2 top-3 z-10 w-56 -translate-x-1/2 px-3 py-2 text-xs" :aria-label="t('sports.tennis.freePlay')">
    <p class="m-0 mb-1 font-display text-[11px] uppercase tracking-[0.16em] text-mint">{{ t('sports.tennis.freePlay') }}</p>
    <p class="m-0 text-mist">{{ t('sports.tennis.freeControls') }}</p>
  </section>
  <p v-if="cue" class="cc-hud pointer-events-none absolute left-1/2 top-1/2 z-10 m-0 -translate-x-1/2 translate-y-8 px-3 py-1 text-sm font-bold text-sun">
    {{ t('sports.tennis.hit') }}
  </p>
  <p
    v-if="timing"
    :key="timing"
    class="pointer-events-none absolute left-1/2 top-[58%] z-10 m-0 -translate-x-1/2 animate-cc-pop font-display text-2xl uppercase tracking-[0.12em] drop-shadow"
    :class="TIMING_TONE[timing]"
    role="status"
    aria-live="polite"
  >
    {{ t(`sports.tennis.timing.${timing}`) }}
  </p>
  <p v-if="hud?.knocked" class="pointer-events-none absolute left-1/2 top-[64%] z-10 m-0 -translate-x-1/2 animate-cc-pop font-display text-2xl uppercase tracking-[0.12em] text-coral drop-shadow" role="status" aria-live="polite">
    {{ t('sports.tennis.cove.knocked') }}
  </p>
  <p v-if="call" class="pointer-events-none absolute left-1/2 top-1/3 z-10 m-0 -translate-x-1/2 font-display text-4xl uppercase text-sun drop-shadow">
    {{ t(`sports.tennis.calls.${call}`) }}
  </p>
</template>
