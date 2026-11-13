<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchTasks, type TaskProgress } from '../../api/tasks'
import { matches } from '../../config/keybindings'
import { nextGoal, TIER_TONE } from '../../game/taskProgress'

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const tasks = ref<TaskProgress[] | null>(null)
const error = ref<string | null>(null)
const TIERS = [1, 2, 3] as const

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' && !matches('tasks', e.code)) return
  e.preventDefault()
  e.stopPropagation()
  emit('close')
}

const rows = computed(() =>
  tasks.value?.map((task) => {
    const goal = nextGoal(task.value, task.tiers)
    return { ...task, goal, percent: goal === null ? 100 : Math.floor((task.value / goal.target) * 100) }
  }),
)

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
  fetchTasks()
    .then((list) => (tasks.value = list))
    .catch((err: unknown) => (error.value = err instanceof Error ? err.message : String(err)))
})
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-start justify-center bg-black/40 p-4 pt-16" @mousedown.self="emit('close')">
    <section class="cc-panel w-[min(520px,100%)] animate-cc-pop overflow-hidden" :aria-label="t('tasks.title')">
      <header class="cc-panel-header bg-ink-950/40">
        <h2 class="cc-display m-0 text-xl leading-none">{{ t('tasks.title') }}</h2>
      </header>
      <p v-if="error" class="m-0 p-5 text-sm font-semibold text-coral" role="alert">{{ error }}</p>
      <ul v-else-if="rows" class="m-0 max-h-[60vh] list-none overflow-y-auto p-2">
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
    </section>
  </div>
</template>
