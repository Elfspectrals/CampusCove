<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PetanqueMode, PetanqueStatePayload } from '../../game/sports/petanque'
import type { SportsTeam } from '../../game/sports/sportsSignup'

const props = defineProps<{
  game: PetanqueStatePayload
  mySessionId: string | null
  myTurn: boolean
  inCircle: boolean
  busy: boolean
  mode: PetanqueMode
  power: number | null
  carreau: boolean
  secondsLeft: number
}>()

const { t } = useI18n()

const TEAM_TEXT: Record<SportsTeam, string> = { red: 'text-coral', blue: 'text-pool' }
const TEAM_BAR: Record<SportsTeam, string> = { red: 'bg-coral', blue: 'bg-pool' }

const thrower = computed(() => props.game.players.find((p) => p.sessionId === props.game.thrower) ?? null)

const status = computed(() => {
  const g = props.game
  if (g.phase === 'between') {
    if (!g.lastEnd || g.lastEnd.team === null) return t('petanque.endVoid')
    return t('petanque.endScored', { team: t(`petanque.teams.${g.lastEnd.team}`), n: g.lastEnd.points })
  }
  if (props.myTurn) {
    if (!props.inCircle) return t('petanque.goToCircle')
    if (props.busy) return t('petanque.waitRoll')
    return g.phase === 'jack' ? t('petanque.throwJack') : t('petanque.throwBoule')
  }
  return thrower.value ? t('petanque.theirTurn', { name: thrower.value.name }) : t('petanque.waitRoll')
})

const distances = computed(() =>
  props.game.distancesCm.slice(0, 4).map((d) => {
    const ball = props.game.balls.find((b) => b.id === d.id)
    return { ...d, team: ball?.team ?? null, point: props.game.point?.ball === d.id }
  }),
)

const powerPercent = computed(() => Math.round((props.power ?? 0) * 100))
</script>

<template>
  <section class="cc-hud pointer-events-none absolute left-1/2 top-3 z-[30] w-[min(340px,92vw)] -translate-x-1/2 p-0 text-xs" :aria-label="t('petanque.title')">
    <header class="flex items-center justify-between bg-coral px-3 py-1.5 text-ink-950">
      <span class="font-display text-[11px] uppercase tracking-[0.16em]">{{ t('petanque.title') }}</span>
      <span class="font-bold">{{ t('petanque.endOf', { end: game.end, target: game.target }) }}</span>
    </header>

    <div class="flex flex-col gap-2 px-3 py-2">
      <p class="m-0 flex items-center justify-center gap-3 font-display text-lg">
        <span class="text-coral">{{ game.score.red }}</span>
        <span class="text-mist">–</span>
        <span class="text-pool">{{ game.score.blue }}</span>
      </p>

      <p class="m-0 flex items-center justify-between gap-2 font-bold text-fog" role="status" aria-live="polite">
        <span class="min-w-0 flex-1">{{ status }}</span>
        <span v-if="game.phase !== 'between'" class="text-sun">{{ t('petanque.seconds', { n: secondsLeft }) }}</span>
      </p>

      <p v-if="carreau" class="m-0 animate-cc-pop text-center font-display text-base text-sun">{{ t('petanque.carreau') }}</p>

      <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
        <li v-for="player in game.players" :key="player.sessionId" class="flex items-center gap-1.5 font-bold" :class="player.out ? 'text-mist line-through' : 'text-fog'">
          <span class="h-2 w-2 shrink-0 rounded-full" :class="player.team ? TEAM_BAR[player.team] : 'bg-mist'" />
          <span class="min-w-0 flex-1 truncate">{{ player.name }}<span v-if="player.sessionId === mySessionId" class="text-mist"> · {{ t('petanque.you') }}</span></span>
          <span v-if="player.sessionId === game.thrower" class="text-sun">●</span>
          <span>{{ t('petanque.boulesLeft', { n: player.left }) }}</span>
        </li>
      </ul>

      <div v-if="distances.length > 0" class="flex flex-col gap-0.5">
        <p class="m-0 font-display text-[11px] uppercase tracking-[0.16em] text-mint">{{ t('petanque.toJack') }}</p>
        <ol class="m-0 flex list-none flex-col gap-0.5 p-0">
          <li v-for="row in distances" :key="row.id" class="flex items-center gap-1.5 font-bold" :class="row.team ? TEAM_TEXT[row.team] : 'text-fog'">
            <span class="w-4 text-sun">{{ row.point ? '★' : '' }}</span>
            <span class="min-w-0 flex-1">{{ row.team ? t(`petanque.teams.${row.team}`) : '' }}</span>
            <span>{{ t('petanque.cm', { n: row.cm }) }}</span>
          </li>
        </ol>
      </div>

      <div v-if="myTurn && game.phase !== 'between'" class="flex flex-col gap-1 border-t border-line pt-2">
        <p class="m-0 flex items-center justify-between font-bold text-fog">
          <span>{{ game.phase === 'jack' ? t('petanque.modes.jack') : t(`petanque.modes.${mode}`) }}</span>
          <span v-if="game.phase === 'boules'" class="text-mist">{{ t('petanque.switchMode') }}</span>
        </p>
        <span class="block h-2 overflow-hidden rounded-full bg-ink-950/70" role="meter" :aria-label="t('petanque.power')" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="powerPercent">
          <span class="block h-full rounded-full bg-sun" :style="{ width: `${powerPercent}%` }" />
        </span>
        <p class="m-0 text-mist">{{ t('petanque.howTo') }}</p>
      </div>
    </div>
  </section>
</template>
