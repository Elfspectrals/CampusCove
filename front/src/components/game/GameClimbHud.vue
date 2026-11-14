<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { actionKeyLabels } from '../../config/keybindings'

const props = defineProps<{
  hud: {
    name: string
    colour: string
    hex: string
    kind: 'route' | 'boulder'
    phase: 'climbing' | 'lowering' | 'ended'
    grip: number
    reached: number
    holds: number
    seconds: number
    duel: boolean
    rival: { reached: number; holds: number } | null
    waiting: boolean
    startsIn: number
  }
}>()

const { t } = useI18n()
const letGoKey = computed(() => actionKeyLabels('jump')[0] ?? 'Space')
const gripTone = computed(() => (props.hud.grip > 0.5 ? 'bg-mint' : props.hud.grip > 0.25 ? 'bg-sun' : 'bg-coral animate-pulse'))
const status = computed(() => {
  if (props.hud.phase === 'lowering') return t('climbing.lowering')
  if (props.hud.waiting) return t('climbing.startsIn', { s: props.hud.startsIn })
  return `${props.hud.seconds.toFixed(1)} s`
})
</script>

<template>
  <section
    class="cc-hud pointer-events-none absolute bottom-24 left-1/2 z-[30] w-[min(360px,92vw)] -translate-x-1/2 animate-cc-pop overflow-hidden p-0 select-none"
    :aria-label="hud.name"
  >
    <header class="flex items-center justify-between px-4 py-2 text-ink-950" :style="{ backgroundColor: hud.hex }">
      <span class="font-display text-sm uppercase tracking-[0.18em]" :class="hud.colour === 'black' ? 'text-white' : ''">{{ hud.name }}</span>
      <span class="text-xs font-bold" :class="hud.colour === 'black' ? 'text-white' : ''">
        {{ t(`climbing.kinds.${hud.kind}`) }} · {{ t(`climbing.colours.${hud.colour}`) }}
      </span>
    </header>
    <div class="flex flex-col gap-2 px-4 py-3">
      <p class="m-0 font-display text-lg text-fog" aria-live="polite">{{ status }}</p>
      <div class="flex items-center gap-2">
        <span class="w-10 text-[11px] font-bold text-mist">{{ t('climbing.grip') }}</span>
        <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-ink-950/80" role="meter" :aria-valuenow="Math.round(hud.grip * 100)" aria-valuemin="0" aria-valuemax="100">
          <div class="h-full rounded-full transition-[width] duration-200" :class="gripTone" :style="{ width: `${hud.grip * 100}%` }" />
        </div>
      </div>
      <p class="m-0 flex justify-between text-xs font-bold text-fog">
        <span>{{ t('climbing.holds', { reached: hud.reached, holds: hud.holds }) }}</span>
        <span v-if="hud.rival" class="text-coral">{{ t('climbing.rival', { reached: hud.rival.reached, holds: hud.rival.holds }) }}</span>
      </p>
      <p class="m-0 text-[11px] text-mist">{{ t('climbing.hint', { key: letGoKey }) }}</p>
    </div>
  </section>
</template>
