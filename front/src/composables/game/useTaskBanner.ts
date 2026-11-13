import { ref } from 'vue'
import { playTaskChime } from '../../game/taskChime'
import type { TaskDonePayload } from '../../types/gameRealtime'

const SHOWN_MS = 4000

export function useTaskBanner() {
  const shown = ref<TaskDonePayload | null>(null)
  const waiting: TaskDonePayload[] = []

  function showNext(): void {
    shown.value = waiting.shift() ?? null
    if (shown.value === null) return
    playTaskChime()
    setTimeout(showNext, SHOWN_MS)
  }

  function onDone(data: TaskDonePayload): void {
    waiting.push(data)
    if (shown.value === null) showNext()
  }

  return { shown, handlers: { onDone } }
}
