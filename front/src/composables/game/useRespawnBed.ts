import type { Ref, ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import type * as THREE from 'three'
import { isRespawnBed } from '../../game/town/respawnBed'
import type { BedErrorPayload, HouseFurniturePayload } from '../../types/gameRealtime'
import type { InteractionSource } from './useInteractionTargets'
import { createPlacedObjectAim } from './placedObjectAim'

export interface RespawnBedDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  houses: () => readonly HouseFurniturePayload[]
  promptLabel: () => string
  say: (text: string) => void
  doneMessage: () => string
}

export function useRespawnBed(deps: RespawnBedDeps) {
  const aim = createPlacedObjectAim(deps, isRespawnBed)

  function prompt() {
    return deps.promptsHidden() ? null : aim.prompt(deps.promptLabel())
  }

  function interact(): boolean {
    const target = aim.aimed()
    const room = deps.gameRoomRef.value
    if (!target || !room) return false
    room.send('bed_set', { objectId: target.objectId })
    return true
  }

  const handlers = {
    onDone: () => deps.say(deps.doneMessage()),
    onError: (data: BedErrorPayload) => deps.say(data.message),
  }

  const source: InteractionSource = { prompt, interact }

  return { source, handlers }
}
