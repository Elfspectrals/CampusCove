<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { keyLabel } from '../../config/keybindings'
import type { EmoteWheelRow } from '../../game/sports/danceEmotes'

defineProps<{
  rows: EmoteWheelRow[]
  current: string | null
}>()

const { t } = useI18n()
</script>

<template>
  <section class="cc-hud pointer-events-none absolute bottom-28 left-1/2 z-[36] w-[min(320px,92vw)] -translate-x-1/2 animate-cc-pop p-0" :aria-label="t('emotes.title')">
    <header class="flex items-center justify-between bg-mint px-4 py-2 text-ink-950">
      <span class="font-display text-sm uppercase tracking-[0.18em]">{{ t('emotes.title') }}</span>
    </header>
    <ol class="m-0 flex list-none flex-col gap-1 px-3 py-2">
      <li v-for="row in rows" :key="row.id" class="flex items-center gap-3 text-sm font-bold" :class="row.locked ? 'text-mist/60' : row.id === current ? 'text-sun' : 'text-fog'">
        <span class="w-6 rounded bg-ink-950/60 text-center text-xs">{{ keyLabel(row.key) }}</span>
        <span class="min-w-0 flex-1 truncate">{{ t(`emotes.names.${row.id}`) }}</span>
        <span v-if="row.locked" class="text-xs text-mist">{{ t('emotes.lockedTier', { tier: t(`emotes.tiers.${row.tier}`) }) }}</span>
      </li>
      <li class="flex items-center gap-3 text-sm font-bold text-mist">
        <span class="w-6 rounded bg-ink-950/60 text-center text-xs">0</span>
        <span>{{ t('emotes.stop') }}</span>
      </li>
    </ol>
  </section>
</template>
