import { ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import type { AdminMenuPayload, AdminSummonedPayload } from '../../types/gameRealtime'

export interface AdminWatchDeps {
  gameRoomRef: ShallowRef<Room | null>
  say: (text: string) => void
}

/**
 * The watch's Admin app, only for accounts the API flags is_admin (told by the server at join): teleport to a public
 * place, or bring a player next to you. The server checks the flag again on every message and moves the players.
 */
export function useAdminWatch(deps: AdminWatchDeps) {
  const isAdmin = ref(false)
  const menu = ref<AdminMenuPayload | null>(null)
  const error = ref<string | null>(null)

  const send = (type: string, payload?: unknown) => deps.gameRoomRef.value?.send(type, payload)

  /** Asks for the places and the online players; the app shows them when 'admin_menu' answers. */
  function load(): void {
    if (!isAdmin.value) return
    error.value = null
    send('admin_open')
  }

  function teleport(key: string): void {
    error.value = null
    send('admin_teleport', { key })
  }

  function summon(sessionId: string): void {
    error.value = null
    send('admin_summon', { sessionId })
  }

  return {
    isAdmin,
    menu,
    error,
    load,
    teleport,
    summon,
    handlers: {
      onInit: (admin: boolean) => {
        isAdmin.value = admin
      },
      onMenu: (data: AdminMenuPayload) => {
        menu.value = {
          destinations: Array.isArray(data.destinations) ? data.destinations : [],
          players: Array.isArray(data.players) ? data.players : [],
        }
      },
      onError: (data: { message: string }) => {
        error.value = data.message
      },
      onSummoned: (data: AdminSummonedPayload) => deps.say(`${data.byPseudo} brought you here.`),
    },
  }
}
