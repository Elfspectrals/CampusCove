<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { TIER_TONE } from '../../game/taskProgress'
import type { TaskDonePayload } from '../../types/gameRealtime'

defineProps<{
  done: TaskDonePayload
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="cc-hud pointer-events-none absolute left-1/2 top-20 z-10 flex -translate-x-1/2 animate-cc-pop flex-col items-center gap-0.5 border-y-2 px-8 py-2 text-center"
    :class="[TIER_TONE[done.tier].text, TIER_TONE[done.tier].border]"
    role="status"
  >
    <span class="text-xs font-bold uppercase opacity-80">{{ t('tasks.done') }}</span>
    <span class="text-lg font-extrabold">★ {{ t(`tasks.names.${done.task}`) }} {{ t(`tasks.tiers.${done.tier}`) }} ★</span>
    <span class="text-sm">{{ t(`tasks.goals.${done.task}`, { n: done.threshold.toLocaleString() }) }}</span>
  </div>
</template>
