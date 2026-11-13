import { ref, watch, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import { PUNCH_COOLDOWN_MS } from '../../game/punch'
import type { SfxName } from '../../game/sfx'

export interface HeldToolDeps {
  gameRoomRef: ShallowRef<Room | null>
  selectedCode: () => string | null
  itemName: (code: string) => string
  say: (text: string) => void
  playSound: (name: SfxName) => void
  refreshInventory: () => void
}

export function useHeldTool(deps: HeldToolDeps) {
  const cooldownMs = ref(PUNCH_COOLDOWN_MS)
  const code = ref<string | null>(null)

  function bindRoom(room: Room): void {
    room.onMessage('tool_held', (data: { code: string | null; cooldownMs: number }) => {
      cooldownMs.value = data.cooldownMs
      code.value = data.code
    })
    room.onMessage('tool_worn', (data: { code: string; usesLeft: number }) => {
      if (data.usesLeft > 0) return
      deps.playSound('impact')
      deps.say(`Your ${deps.itemName(data.code)} broke.`)
      deps.refreshInventory()
    })
  }

  watch(deps.gameRoomRef, (room) => {
    if (room) bindRoom(room)
  })

  watch([deps.gameRoomRef, deps.selectedCode], ([room, code]) => {
    room?.send('hold', { code })
  })

  return { cooldownMs, code }
}
