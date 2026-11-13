<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TaskProgress } from '../../api/tasks'
import { nextGoal, TIER_TONE } from '../../game/taskProgress'

const props = defineProps<{
  tasks: TaskProgress[]
}>()

const { t } = useI18n()
const TIERS = [1, 2, 3] as const

const rows = computed(() =>
  props.tasks.map((task) => {
    const goal = nextGoal(task.value, task.tiers)
    return { ...task, goal, percent: goal === null ? 100 : Math.floor((task.value / goal.target) * 100) }
  }),
)
</script>

<template>
  <ul class="m-0 list-none p-2">
    <li v-for="task in rows" :key="task.task" class="flex flex-col gap-1.5 rounded-xl px-3 py-2.5 odd:bg-ink-950/40">
      <div class="flex items-center gap-3">
        <span class="min-w-0 flex-1 truncate font-bold text-fog">{{ t(`tasks.names.${task.task}`) }}</span>
        <span
          v-for="tier in TIERS"
          :key="tier"
          :class="['size-3 shrink-0 rounded-full border', TIER_TONE[tier].border, task.reached.includes(tier) ? TIER_TONE[tier].fill : 'bg-transparent']"
          :aria-label="t(`tasks.tiers.${tier}`)"
        />
      </div>
      <div class="flex items-center gap-3">
        <div class="h-2 flex-1 overflow-hidden rounded-full bg-ink-950/60">
          <div class="h-full rounded-full bg-sun" :style="{ width: `${task.percent}%` }" />
        </div>
        <span class="shrink-0 font-mono text-xs text-mist">
          {{ task.goal ? t('tasks.progress', { value: task.value.toLocaleString(), target: task.goal.target.toLocaleString() }) : t('tasks.complete') }}
        </span>
      </div>
      <span v-if="task.goal" class="text-xs text-mist">{{ t('tasks.next', { tier: t(`tasks.tiers.${task.goal.tier}`) }) }}</span>
    </li>
  </ul>
</template>
