import { computed, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import type * as THREE from 'three'
import { fetchOfferable, type OfferableItem } from '../../api/trades'
import { isStorageFurniture, storableItems } from '../../game/town/furnitureStorage'
import type { HouseFurniturePayload, StorageErrorPayload, StorageScreenPayload } from '../../types/gameRealtime'
import type { InteractionSource } from './useInteractionTargets'
import { createPlacedObjectAim } from './placedObjectAim'

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
  const aim = createPlacedObjectAim(deps, isStorageFurniture)

  function prompt() {
    return deps.promptsHidden() || open.value ? null : aim.prompt(deps.promptLabel())
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
    const target = aim.aimed()
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
