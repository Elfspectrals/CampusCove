import type { Ref } from 'vue'
import * as THREE from 'three'
import { isAimingAtNpc } from '../../game/pub/npcAim'
import { openHouseInterior } from '../../game/town/openHouses'
import type { HouseFurniturePayload } from '../../types/gameRealtime'
import type { ScreenPrompt } from './useInteractionTargets'

const PLACED_OBJECT_REACH = 2.3
const PROMPT_HEIGHT = 1.4

export interface PlacedObjectAimDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  houses: () => readonly HouseFurniturePayload[]
}

export function createPlacedObjectAim(deps: PlacedObjectAimDeps, accepts: (objectKey: string) => boolean) {
  const forward = new THREE.Vector3()
  const world = new THREE.Vector3()
  const projection = new THREE.Vector3()

  function aimed(): { objectId: string; point: THREE.Vector3 } | null {
    const camera = deps.getCamera()
    if (!camera) return null
    camera.getWorldDirection(forward)
    for (const house of deps.houses()) {
      const interior = house.model_key ? openHouseInterior(house.model_key) : undefined
      if (!interior) continue
      for (const object of house.objects) {
        if (!accepts(object.objectKey)) continue
        interior.localToWorld(world.set(object.x, object.y, object.z))
        if (isAimingAtNpc(deps.myPosition, forward, [world.x, world.y, world.z], PLACED_OBJECT_REACH)) return { objectId: object.objectId, point: world.clone() }
      }
    }
    return null
  }

  function prompt(action: string): ScreenPrompt | null {
    const target = aimed()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!target || !camera || !canvas) return null
    projection.set(target.point.x, target.point.y + PROMPT_HEIGHT, target.point.z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, action }
  }

  return { aimed, prompt }
}
