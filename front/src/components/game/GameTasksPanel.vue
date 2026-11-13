<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTasks } from '../../composables/useTasks'
import { matches } from '../../config/keybindings'
import TaskProgressList from '../tasks/TaskProgressList.vue'

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const { tasks, error } = useTasks()

function onKey(e: KeyboardEvent): void {
  if (e.key !== 'Escape' && !matches('tasks', e.code)) return
  e.preventDefault()
  e.stopPropagation()
  emit('close')
}

onMounted(() => window.addEventListener('keydown', onKey, true))
onUnmounted(() => window.removeEventListener('keydown', onKey, true))
</script>

<template>
  <div class="absolute inset-0 z-[40] flex items-start justify-center bg-black/40 p-4 pt-16" @mousedown.self="emit('close')">
    <section class="cc-panel w-[min(520px,100%)] animate-cc-pop overflow-hidden" :aria-label="t('tasks.title')">
      <header class="cc-panel-header bg-ink-950/40">
        <h2 class="cc-display m-0 text-xl leading-none">{{ t('tasks.title') }}</h2>
      </header>
      <p v-if="error" class="m-0 p-5 text-sm font-semibold text-coral" role="alert">{{ error }}</p>
      <div v-else-if="tasks" class="max-h-[60vh] overflow-y-auto">
        <TaskProgressList :tasks="tasks" />
      </div>
    </section>
  </div>
</template>
