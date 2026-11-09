import { computed, onUnmounted, ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matches, mouseButtonCode } from '../../config/keybindings'
import { recoveryProgress } from '../../game/clinic'
import { CROP_LABELS, PICK_MS, PLANT_KEEP_REACH, PLANT_PROMPT_REACH } from '../../game/farm'
import { nearestTree, withinReach } from '../../game/orchard'
import type { CropPlant, WorldManifest } from '../../game/world/worldManifest'
import type { FarmErrorPayload, FarmPickedPayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const PROMPT_HEIGHT = 1.2

export interface FarmDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  refreshInventory: () => void
  say: (text: string) => void
}

export function useFarm(deps: FarmDeps) {
  const pickProgress = ref<number | null>(null)
  const pickingCrop = ref<string | null>(null)
  const pickLabel = computed(() => (pickingCrop.value ? `Picking ${pickingCrop.value}…` : ''))
  let plants: CropPlant[] = []
  let positions: CropPlant['position'][] = []
  let picking: { plant: number; startedAt: number } | null = null
  const projection = new THREE.Vector3()

  function onTownLoaded(manifest: WorldManifest): void {
    plants = manifest.crops ?? []
    positions = plants.map((plant) => plant.position)
  }

  function plantInReach(): number | null {
    return nearestTree(positions, deps.myPosition, PLANT_PROMPT_REACH)
  }

  function cancelPick(): void {
    picking = null
    pickingCrop.value = null
    pickProgress.value = null
  }

  function startPick(plant: number): void {
    picking = { plant, startedAt: performance.now() }
    pickingCrop.value = CROP_LABELS[plants[plant]!.crop]
    pickProgress.value = 0
    deps.gameRoomRef.value?.send('farm_pick_start', { plant })
  }

  function tick(): void {
    if (!picking) return
    if (deps.promptsHidden()) {
      cancelPick()
      return
    }
    if (!withinReach(positions[picking.plant]!, deps.myPosition, PLANT_KEEP_REACH)) {
      cancelPick()
      deps.say('You stepped away from the plant.')
      return
    }
    pickProgress.value = recoveryProgress(picking.startedAt, PICK_MS, performance.now())
    if (pickProgress.value < 1) return
    cancelPick()
    deps.gameRoomRef.value?.send('farm_pick')
  }

  function onRelease(code: string): void {
    if (picking && matches('interact', code)) cancelPick()
  }
  const onKeyUp = (e: KeyboardEvent) => onRelease(e.code)
  const onMouseUp = (e: MouseEvent) => onRelease(mouseButtonCode(e.button))
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('blur', cancelPick)
  onUnmounted(() => {
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('blur', cancelPick)
  })

  function onPicked(data: FarmPickedPayload): void {
    deps.refreshInventory()
    deps.say(`Picked · ${data.quantity} in your basket`)
  }

  function onError(data: FarmErrorPayload): void {
    cancelPick()
    deps.say(data.message)
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden() || picking) return null
    const plant = plantInReach()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (plant === null || !camera || !canvas) return null
    const [x, y, z] = plants[plant]!.position
    projection.set(x, y + PROMPT_HEIGHT, z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (projection.x * 0.5 + 0.5) * rect.width,
      y: (-projection.y * 0.5 + 0.5) * rect.height,
      action: 'Pick',
      detail: `Hold 3 s for ${CROP_LABELS[plants[plant]!.crop]}`,
    }
  }

  function interact(): boolean {
    if (picking) return true
    const plant = plantInReach()
    if (plant === null) return false
    startPick(plant)
    return true
  }

  const source: InteractionSource = { prompt, interact }

  return { pickProgress, pickLabel, onTownLoaded, tick, source, handlers: { onPicked, onError } }
}
