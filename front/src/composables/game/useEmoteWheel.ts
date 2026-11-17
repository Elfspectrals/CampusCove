import { computed, ref, shallowRef, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import { EMOTE_STOP_KEY, clipOf, parseEmoteDefs, wheelRows, type EmoteDef } from '../../game/sports/danceEmotes'
import { sportRulesUrl } from '../../game/sports/sportsSignup'

export interface EmoteWheelDeps {
  gameRoomRef: ShallowRef<Room | null>
  isWheelKey: (code: string) => boolean
  blocked: () => boolean
  lockedText: () => string
  say: (text: string) => void
}

export interface UserEmotePayload {
  sessionId: string
  emote: string | null
}

export function useEmoteWheel(deps: EmoteWheelDeps) {
  const defs = shallowRef<EmoteDef[]>([])
  const unlocked = shallowRef<ReadonlySet<string> | null>(null)
  const open = ref(false)
  const myEmote = ref<string | null>(null)
  const rows = computed(() => wheelRows(defs.value, unlocked.value))

  void fetch(sportRulesUrl('dance'))
    .then((response) => {
      if (!response.ok) throw new Error(`dance.json: HTTP ${response.status}`)
      return response.json()
    })
    .then((rules: unknown) => (defs.value = parseEmoteDefs(rules)))
    .catch((err: unknown) => console.error('[emotes] could not load the dances', err))

  function send(type: string, payload: unknown): void {
    deps.gameRoomRef.value?.send(type, payload)
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (deps.isWheelKey(e.code) && !e.repeat) {
      if (!open.value && deps.blocked()) return false
      open.value = !open.value
      if (open.value) send('emote_list', {})
      return true
    }
    if (!open.value) return false
    if (e.code === 'Escape') {
      open.value = false
      return true
    }
    if (e.code === EMOTE_STOP_KEY) {
      send('emote_play', { emote: null })
      open.value = false
      return true
    }
    const row = rows.value.find((r) => r.key === e.code)
    if (!row) return e.code.startsWith('Digit')
    if (row.locked) {
      deps.say(deps.lockedText())
      return true
    }
    send('emote_play', { emote: row.id })
    open.value = false
    return true
  }

  const handlers = {
    onUserEmote(data: UserEmotePayload, mySessionId: string): void {
      if (data.sessionId === mySessionId) myEmote.value = data.emote
    },
    onList(data: { unlocked: string[] }): void {
      unlocked.value = new Set(data.unlocked)
    },
    onError(data: { message: string }): void {
      deps.say(data.message)
    },
  }

  return {
    open,
    rows,
    myEmote,
    handlers,
    onKeyDown,
    clipOf: (id: string) => clipOf(defs.value, id),
    close: () => (open.value = false),
  }
}
