<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TaskDonePayload } from '../../types/gameRealtime'

defineProps<{
  done: TaskDonePayload
}>()

const { t } = useI18n()

const TIER_COLOR = {
  1: 'text-[#d08a4e] border-[#d08a4e]/70',
  2: 'text-[#d6dde4] border-[#d6dde4]/70',
  3: 'text-sun border-sun/70',
} as const
</script>

<template>
  <div
    class="cc-hud pointer-events-none absolute left-1/2 top-20 z-10 flex -translate-x-1/2 animate-cc-pop flex-col items-center gap-0.5 border-y-2 px-8 py-2 text-center"
    :class="TIER_COLOR[done.tier]"
    role="status"
  >
    <span class="text-xs font-bold uppercase opacity-80">{{ t('tasks.done') }}</span>
    <span class="text-lg font-extrabold">★ {{ t(`tasks.names.${done.task}`) }} {{ t(`tasks.tiers.${done.tier}`) }} ★</span>
    <span class="text-sm">{{ t(`tasks.goals.${done.task}`, { n: done.threshold.toLocaleString() }) }}</span>
  </div>
</template>
