import { computed, onUnmounted, ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matches, mouseButtonCode } from '../../config/keybindings'
import { recoveryProgress } from '../../game/clinic'
import { CROP_LABELS, PICK_MS, fieldAt } from '../../game/farm'
import type { FarmLayout, WorldManifest } from '../../game/world/worldManifest'
import type { FarmErrorPayload, FarmPickedPayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const PROMPT_AHEAD = 1.4
const PROMPT_HEIGHT = 0.9

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
  let layout: FarmLayout | null = null
  let picking: { field: number; startedAt: number } | null = null
  const pickingCrop = ref<string | null>(null)
  const pickLabel = computed(() => (pickingCrop.value ? `Picking ${pickingCrop.value}…` : ''))
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()

  function onTownLoaded(manifest: WorldManifest): void {
    layout = manifest.farm ?? null
  }

  function fieldHere(): number | null {
    return layout ? fieldAt(layout.fields, deps.myPosition) : null
  }

  function cancelPick(): void {
    picking = null
    pickingCrop.value = null
    pickProgress.value = null
  }

  function startPick(field: number): void {
    picking = { field, startedAt: performance.now() }
    pickingCrop.value = CROP_LABELS[layout!.fields[field]!.crop]
    pickProgress.value = 0
    deps.gameRoomRef.value?.send('farm_pick_start', { field })
  }

  function tick(): void {
    if (!picking) return
    if (deps.promptsHidden()) {
      cancelPick()
      return
    }
    if (fieldHere() !== picking.field) {
      cancelPick()
      deps.say('You stepped out of the field.')
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
    if (!layout || deps.promptsHidden() || picking) return null
    const field = fieldHere()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (field === null || !camera || !canvas) return null
    camera.getWorldDirection(forward)
    forward.setY(0).normalize()
    const { x, y, z } = deps.myPosition
    projection.set(x + forward.x * PROMPT_AHEAD, y - PROMPT_HEIGHT, z + forward.z * PROMPT_AHEAD).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (projection.x * 0.5 + 0.5) * rect.width,
      y: (-projection.y * 0.5 + 0.5) * rect.height,
      action: 'Pick',
      detail: `Hold 3 s for ${CROP_LABELS[layout.fields[field]!.crop]}`,
    }
  }

  function interact(): boolean {
    if (!layout) return false
    if (picking) return true
    const field = fieldHere()
    if (field === null) return false
    startPick(field)
    return true
  }

  const source: InteractionSource = { prompt, interact }

  return { pickProgress, pickLabel, onTownLoaded, tick, source, handlers: { onPicked, onError } }
}
