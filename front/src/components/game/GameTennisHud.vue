<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TennisCall, TennisHud } from '../../composables/game/useTennis'

defineProps<{ hud: TennisHud | null; cue: boolean; call: TennisCall; freePlay: boolean }>()
const { t } = useI18n()
const TEAMS = ['red', 'blue'] as const
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
    <p v-if="hud.winner" class="m-0 mt-1 font-bold text-sun">
      {{ hud.myTeam === null ? t('sports.tennis.winner', { team: t(`sports.teams.${hud.winner}`) }) : hud.myTeam === hud.winner ? t('sports.tennis.won') : t('sports.tennis.lost') }}
    </p>
    <p v-else-if="hud.iServe" class="m-0 mt-1 text-mist">{{ hud.tossing ? t('sports.tennis.hitToss') : t('sports.tennis.serve') }}</p>
    <p v-else-if="hud.myTeam" class="m-0 mt-1 text-mist">{{ t('sports.tennis.controls') }}</p>
  </section>
  <section v-else-if="freePlay" class="cc-hud pointer-events-none absolute left-1/2 top-3 z-10 w-56 -translate-x-1/2 px-3 py-2 text-xs" :aria-label="t('sports.tennis.freePlay')">
    <p class="m-0 mb-1 font-display text-[11px] uppercase tracking-[0.16em] text-mint">{{ t('sports.tennis.freePlay') }}</p>
    <p class="m-0 text-mist">{{ t('sports.tennis.freeControls') }}</p>
  </section>
  <p v-if="cue" class="cc-hud pointer-events-none absolute left-1/2 top-1/2 z-10 m-0 -translate-x-1/2 translate-y-8 px-3 py-1 text-sm font-bold text-sun">
    {{ t('sports.tennis.hit') }}
  </p>
  <p v-if="call" class="pointer-events-none absolute left-1/2 top-1/3 z-10 m-0 -translate-x-1/2 font-display text-4xl uppercase text-sun drop-shadow">
    {{ t(`sports.tennis.calls.${call}`) }}
  </p>
</template>
