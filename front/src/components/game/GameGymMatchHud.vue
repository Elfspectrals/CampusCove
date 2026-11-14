<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { actionKeyLabels } from '../../config/keybindings'
import type { GymBanner, GymRimPop } from '../../composables/game/useGymMatch'
import type { GymShotRelease, GymSport, GymTeam } from '../../types/gameRealtime'

const props = defineProps<{
  hud: {
    sport: GymSport
    score: Record<GymTeam, number>
    clock: string
    half: number
    halves: number
    team: GymTeam | null
    meter: { fill: number; goodFrom: number | null } | null
    cooldown: number | null
  } | null
  freeHud: { sport: GymSport; meter: { fill: number; goodFrom: number | null } | null } | null
  banner: GymBanner | null
  rimPop: GymRimPop | null
  releaseLabel: GymShotRelease | null
}>()

const { t } = useI18n()
const TEAM_TEXT: Record<GymTeam, string> = { red: 'text-coral', blue: 'text-pool' }
const TEAM_BG: Record<GymTeam, string> = { red: 'bg-coral', blue: 'bg-pool' }
const RELEASE_TONE: Record<GymShotRelease, string> = { perfect: 'text-mint', good: 'text-sun', early: 'text-coral', late: 'text-coral' }

const teamName = (team: GymTeam) => t(`sports.teams.${team}`)

const bannerText = computed(() => {
  const b = props.banner
  if (!b) return null
  if (b.kind === 'score') {
    if (b.dunk) return t('sports.gym.dunk')
    if (b.sport === 'football') return b.scorer ? t('sports.gym.goalBy', { team: teamName(b.team), name: b.scorer }) : t('sports.gym.goalFor', { team: teamName(b.team) })
    return b.scorer ? t('sports.gym.basketBy', { n: b.points, name: b.scorer }) : t('sports.gym.basket', { n: b.points, team: teamName(b.team) })
  }
  if (b.kind === 'half') return t('sports.gym.secondHalf')
  if (b.kind === 'end') {
    if (b.mine) return b.winner === null ? t('sports.gym.draw') : b.winner === b.mine ? t('sports.gym.youWin') : t('sports.gym.youLose')
    return b.winner === null ? t('sports.gym.draw') : t('sports.gym.teamWins', { team: teamName(b.winner) })
  }
  return t(`sports.gym.${b.kind}`)
})

const bannerTone = computed(() => {
  const b = props.banner
  if (b?.kind === 'score') return TEAM_TEXT[b.team]
  if (b?.kind === 'end' && b.winner) return TEAM_TEXT[b.winner]
  return 'text-sun'
})

const hint = computed(() => {
  const h = props.hud
  const sport = h?.team ? h.sport : props.freeHud?.sport
  if (!sport) return null
  return t('sports.gym.hint', { key: actionKeyLabels('sportsTackle').join(' / '), defend: t(`sports.gym.defend.${sport}`) })
})
</script>

<template>
  <section v-if="hud" class="cc-hud pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-col items-center gap-1 px-4 py-2" :aria-label="t('sports.gym.label')">
    <p class="m-0 font-display text-[11px] uppercase tracking-[0.16em] text-mint">
      {{ t(`sports.sports.${hud.sport}`) }}
      <span v-if="hud.halves > 1" class="text-mist"> · {{ t('sports.gym.half', { n: hud.half, of: hud.halves }) }}</span>
      <span v-if="!hud.team" class="text-mist"> · {{ t('sports.gym.spectating') }}</span>
    </p>
    <p class="m-0 flex items-center gap-3 font-display text-2xl leading-none" role="status" aria-live="polite">
      <span class="text-coral">{{ teamName('red') }} {{ hud.score.red }}</span>
      <span class="text-sm text-fog">{{ hud.clock }}</span>
      <span class="text-pool">{{ hud.score.blue }} {{ teamName('blue') }}</span>
    </p>
    <div v-if="hud.meter" class="flex w-48 flex-col gap-0.5">
      <span class="text-[10px] font-bold uppercase tracking-[0.14em] text-mist">{{ t('sports.gym.shoot') }}</span>
      <span class="relative block h-2 overflow-hidden rounded-full bg-ink-950/70">
        <span v-if="hud.meter.goodFrom !== null" class="absolute inset-y-0 right-0 bg-mint/50" :style="{ left: `${hud.meter.goodFrom * 100}%` }" />
        <span class="relative block h-full rounded-full bg-sun" :style="{ width: `${hud.meter.fill * 100}%` }" />
      </span>
    </div>
    <div v-if="hud.cooldown !== null" class="flex w-48 items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-mist">
      <span>{{ t(`sports.gym.defend.${hud.sport}`) }}</span>
      <span class="block h-1 flex-1 overflow-hidden rounded-full bg-ink-950/70">
        <span class="block h-full rounded-full" :class="hud.team ? TEAM_BG[hud.team] : 'bg-fog'" :style="{ width: `${hud.cooldown * 100}%` }" />
      </span>
    </div>
    <p v-if="hint" class="m-0 text-[10px] text-mist">{{ hint }}</p>
  </section>
  <section v-if="!hud && freeHud" class="cc-hud pointer-events-none absolute left-1/2 top-3 z-10 flex -translate-x-1/2 flex-col items-center gap-1 px-4 py-2" :aria-label="t('sports.gym.free.title')">
    <p class="m-0 font-display text-[11px] uppercase tracking-[0.16em] text-mint">{{ t(`sports.sports.${freeHud.sport}`) }} · {{ t('sports.gym.free.title') }}</p>
    <span v-if="freeHud.meter" class="relative block h-2 w-48 overflow-hidden rounded-full bg-ink-950/70">
      <span class="relative block h-full rounded-full bg-sun" :style="{ width: `${freeHud.meter.fill * 100}%` }" />
    </span>
    <p v-if="hint" class="m-0 text-[10px] text-mist">{{ hint }}</p>
  </section>
  <p
    v-if="releaseLabel"
    :key="releaseLabel"
    class="pointer-events-none absolute left-1/2 top-[58%] z-10 m-0 -translate-x-1/2 animate-cc-pop font-display text-2xl uppercase tracking-[0.12em] drop-shadow"
    :class="RELEASE_TONE[releaseLabel]"
    role="status"
    aria-live="polite"
  >
    {{ t(`sports.gym.release.${releaseLabel}`) }}
  </p>
  <p
    v-if="rimPop"
    class="pointer-events-none absolute z-10 m-0 -translate-x-1/2 -translate-y-1/2 font-display text-4xl drop-shadow"
    :class="TEAM_TEXT[rimPop.team]"
    :style="{ left: `${rimPop.x}px`, top: `${rimPop.y}px` }"
    aria-hidden="true"
  >
    {{ rimPop.text }}
  </p>
  <p
    v-if="bannerText"
    :key="banner?.kind"
    class="cc-hud pointer-events-none absolute left-1/2 top-1/3 z-10 m-0 -translate-x-1/2 animate-cc-pop px-5 py-2 font-display text-3xl uppercase tracking-[0.08em]"
    :class="bannerTone"
    role="status"
    aria-live="assertive"
  >
    {{ bannerText }}
    <span v-if="banner?.kind === 'end'" class="block text-center text-sm normal-case tracking-normal text-fog">
      {{ t('sports.gym.final') }} · {{ banner.score.red }}–{{ banner.score.blue }}
    </span>
  </p>
</template>
