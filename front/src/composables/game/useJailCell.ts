import type { Ref, ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { consumableModelUrl } from '../../game/assets/catalog'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import { createGltfLoader } from '../../game/gltfLoaderFactory'
import { MEAL_TRAY_REACH, inCellReach, trayFoodPosition, type JailCellLayout } from '../../game/police/jailCell'
import { FOUNTAIN_REACH, type Fountain } from '../../game/town/fountains'
import type { WorldManifest } from '../../game/world/worldManifest'
import type { JailTrayPayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const PROMPT_HEIGHT = 0.4

export interface JailCellDeps {
  myPosition: { x: number; y: number; z: number }
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  trayLabel: () => string
  onAte: () => void
}

export function useJailCell(deps: JailCellDeps) {
  let cells: JailCellLayout[] = []
  let cell: JailCellLayout | null = null
  let trayReady = false
  let food: THREE.Object3D | null = null
  let foodRequest = 0
  const projection = new THREE.Vector3()

  function onTownLoaded(manifest: WorldManifest): void {
    cells = manifest.police?.cells ?? []
  }

  function tap(): Fountain | null {
    if (!cell || !inCellReach(cell, cell.tap, deps.myPosition.x, deps.myPosition.z, FOUNTAIN_REACH)) return null
    return { x: cell.tap[0], y: cell.position[1] - EYE_HEIGHT, z: cell.tap[2] }
  }

  function hideFood(): void {
    foodRequest++
    if (!food) return
    food.removeFromParent()
    disposeObject3D(food)
    food = null
  }

  async function showFood(at: JailCellLayout, code: string): Promise<void> {
    hideFood()
    const request = foodRequest
    const gltf = await createGltfLoader().loadAsync(consumableModelUrl(code))
    const scene = deps.getScene()
    if (request !== foodRequest || !scene) return disposeObject3D(gltf.scene)
    gltf.scene.position.fromArray(trayFoodPosition(at))
    scene.add(gltf.scene)
    food = gltf.scene
  }

  function trayInReach(): JailCellLayout | null {
    if (!cell || !trayReady) return null
    return inCellReach(cell, cell.hatch, deps.myPosition.x, deps.myPosition.z, MEAL_TRAY_REACH) ? cell : null
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden()) return null
    const at = trayInReach()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!at || !camera || !canvas) return null
    const [x, y, z] = trayFoodPosition(at)
    projection.set(x, y + PROMPT_HEIGHT, z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, action: deps.trayLabel() }
  }

  function interact(): boolean {
    const room = deps.gameRoomRef.value
    if (!trayInReach() || !room) return false
    room.send('jail_tray_eat')
    return true
  }

  function onTray(data: JailTrayPayload): void {
    const next = cells.find((c) => c.id === data.cellId)
    if (!next) throw new Error(`jail_tray for a cell missing from the world manifest: ${data.cellId}`)
    const ate = trayReady && !data.ready && cell === next
    cell = next
    trayReady = data.ready
    if (data.ready) {
      void showFood(next, data.food).catch((err: unknown) => console.error('[jail] tray food load failed', err))
    } else {
      hideFood()
    }
    if (ate) deps.onAte()
  }

  function clear(): void {
    cell = null
    trayReady = false
    hideFood()
  }

  const source: InteractionSource = { prompt, interact }

  return { source, tap, onTownLoaded, onTray, clear }
}
