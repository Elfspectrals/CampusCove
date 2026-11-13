import { onMounted, ref } from 'vue'
import { fetchTasks, type TaskProgress } from '../api/tasks'

export function useTasks() {
  const tasks = ref<TaskProgress[] | null>(null)
  const error = ref<string | null>(null)

  onMounted(() => {
    fetchTasks()
      .then((list) => (tasks.value = list))
      .catch((err: unknown) => (error.value = err instanceof Error ? err.message : String(err)))
  })

  return { tasks, error }
}
