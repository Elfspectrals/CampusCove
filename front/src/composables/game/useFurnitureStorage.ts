import { computed, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { fetchOfferable, type OfferableItem } from '../../api/trades'
import { isAimingAtNpc } from '../../game/pub/npcAim'
import { openHouseInterior } from '../../game/town/openHouses'
import { isStorageFurniture, storableItems } from '../../game/town/furnitureStorage'
import type { HouseFurniturePayload, StorageErrorPayload, StorageScreenPayload } from '../../types/gameRealtime'
import type { InteractionSource } from './useInteractionTargets'

const STORAGE_REACH = 2.3
const PROMPT_HEIGHT = 1.4

export interface FurnitureStorageDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  houses: () => readonly HouseFurniturePayload[]
  promptLabel: () => string
  onChanged: () => void
}

export function useFurnitureStorage(deps: FurnitureStorageDeps) {
  const objectId = ref<string | null>(null)
  const screen = shallowRef<StorageScreenPayload | null>(null)
  const bag = shallowRef<OfferableItem[]>([])
  const pending = ref(false)
  const error = ref<string | null>(null)
  const open = computed(() => objectId.value !== null)
  const storable = computed(() => (screen.value ? storableItems(bag.value, screen.value.food_only) : []))
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
        if (!isStorageFurniture(object.objectKey)) continue
        interior.localToWorld(world.set(object.x, object.y, object.z))
        if (isAimingAtNpc(deps.myPosition, forward, [world.x, world.y, world.z], STORAGE_REACH)) return { objectId: object.objectId, point: world.clone() }
      }
    }
    return null
  }

  function prompt() {
    if (deps.promptsHidden() || open.value) return null
    const target = aimed()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!target || !camera || !canvas) return null
    projection.set(target.point.x, target.point.y + PROMPT_HEIGHT, target.point.z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, action: deps.promptLabel() }
  }

  async function reloadBag(): Promise<void> {
    try {
      bag.value = (await fetchOfferable()).items
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  function send(type: 'storage_open' | 'storage_deposit' | 'storage_take', extra: { code: string; quantity: number } | null): void {
    const room = deps.gameRoomRef.value
    if (!room || !objectId.value || pending.value) return
    pending.value = true
    error.value = null
    room.send(type, { objectId: objectId.value, ...extra })
  }

  function interact(): boolean {
    if (open.value) return false
    const target = aimed()
    if (!target) return false
    if (document.pointerLockElement) document.exitPointerLock()
    objectId.value = target.objectId
    screen.value = null
    send('storage_open', null)
    void reloadBag()
    return true
  }

  const deposit = (code: string, quantity: number) => send('storage_deposit', { code, quantity })
  const take = (code: string, quantity: number) => send('storage_take', { code, quantity })

  function close(): void {
    objectId.value = null
    screen.value = null
    pending.value = false
    error.value = null
  }

  const handlers = {
    onScreen(data: StorageScreenPayload): void {
      if (data.object_id !== objectId.value) return
      const changed = screen.value !== null
      pending.value = false
      screen.value = data
      if (!changed) return
      void reloadBag()
      deps.onChanged()
    },
    onError(data: StorageErrorPayload): void {
      if (!open.value) return
      pending.value = false
      error.value = data.message
    },
  }

  const source: InteractionSource = { prompt, interact }

  return { open, screen, storable, pending, error, deposit, take, close, source, handlers }
}
