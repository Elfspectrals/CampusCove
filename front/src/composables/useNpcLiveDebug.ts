import { onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { NPC_DEBUG_URL, debugView, type NpcDebugResponse, type NpcDebugView } from '../game/npcBehavior/npcDebug'

const POLL_MS = 500

export function useNpcLiveDebug() {
  const npcId = ref('')
  const view = shallowRef<NpcDebugView | null>(null)
  const error = ref<string | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null

  async function poll(id: string): Promise<void> {
    try {
      const res = await fetch(NPC_DEBUG_URL, { cache: 'no-store' })
      const body = (await res.json()) as NpcDebugResponse & { error?: string }
      if (!res.ok) throw new Error(body.error ?? `live debug answered ${res.status}`)
      if (id !== npcId.value) return
      view.value = debugView(body, id)
      error.value = view.value ? null : `${id} runs in no city instance: is the socket up, with a player in town, and the file saved?`
    } catch (e) {
      if (id !== npcId.value) return
      view.value = null
      error.value = e instanceof Error ? e.message : String(e)
    }
  }

  function stop(): void {
    if (timer) clearInterval(timer)
    timer = null
  }

  watch(npcId, (id) => {
    stop()
    view.value = null
    error.value = null
    if (!id) return
    void poll(id)
    timer = setInterval(() => void poll(id), POLL_MS)
  })
  onBeforeUnmount(stop)

  return { npcId, view, error }
}
