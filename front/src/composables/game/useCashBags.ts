import type { Ref, ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import { createPropObject } from '../../game/mallTemplates/templateProps'
import { isAimingAtNpc } from '../../game/pub/npcAim'
import type { CashBagErrorPayload, CashBagPayload, CashBagPickedPayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const PICK_REACH = 2
const SPIN_PER_S = 1.2
const PROMPT_HEIGHT = 0.8

interface Bag {
  id: number
  position: [number, number, number]
  object: THREE.Object3D | null
  removed: boolean
}

export interface CashBagsDeps {
  myPosition: { x: number; y: number; z: number }
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  promptLabel: () => string
  say: (text: string) => void
  pickedMessage: (amount: number, toolCount: number) => string
  onToolsPicked: () => void
}

export function useCashBags(deps: CashBagsDeps) {
  const bags = new Map<number, Bag>()
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()

  async function add(payload: CashBagPayload): Promise<void> {
    if (bags.has(payload.id)) return
    const bag: Bag = { id: payload.id, position: [payload.x, payload.y - EYE_HEIGHT, payload.z], object: null, removed: false }
    bags.set(bag.id, bag)
    const object = await createPropObject({ kind: 'decor', key: 'cash_bag', id: `cash_bag_${bag.id}`, position: bag.position, yaw: 0, scale: [1, 1, 1] })
    const scene = deps.getScene()
    if (bag.removed || !scene) return disposeObject3D(object)
    object.position.fromArray(bag.position)
    scene.add(object)
    bag.object = object
  }

  function remove(id: number): void {
    const bag = bags.get(id)
    if (!bag) return
    bag.removed = true
    bags.delete(id)
    if (bag.object) {
      bag.object.removeFromParent()
      disposeObject3D(bag.object)
    }
  }

  function sync(list: readonly CashBagPayload[]): void {
    for (const id of [...bags.keys()]) remove(id)
    for (const bag of list) void add(bag)
  }

  function aimed(): Bag | null {
    const camera = deps.getCamera()
    if (!camera) return null
    camera.getWorldDirection(forward)
    return [...bags.values()].find((b) => b.object && isAimingAtNpc(deps.myPosition, forward, b.position, PICK_REACH)) ?? null
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden()) return null
    const bag = aimed()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!bag || !camera || !canvas) return null
    projection.set(bag.position[0], bag.position[1] + PROMPT_HEIGHT, bag.position[2]).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, action: deps.promptLabel() }
  }

  function interact(): boolean {
    const bag = aimed()
    const room = deps.gameRoomRef.value
    if (!bag || !room) return false
    room.send('cash_bag_pick', { id: bag.id })
    return true
  }

  function onPicked(data: CashBagPickedPayload): void {
    remove(data.id)
    applyCachedBalanceAfterPurchase('cash', data.cash)
    const toolCount = data.tools?.length ?? 0
    deps.say(deps.pickedMessage(data.amount, toolCount))
    if (toolCount > 0) deps.onToolsPicked()
  }

  function onError(data: CashBagErrorPayload): void {
    deps.say(data.message)
  }

  function tick(dt: number): void {
    for (const bag of bags.values()) if (bag.object) bag.object.rotation.y += SPIN_PER_S * dt
  }

  function clear(): void {
    for (const id of [...bags.keys()]) remove(id)
  }

  const source: InteractionSource = { prompt, interact }

  return { source, tick, clear, handlers: { onDropped: (b: CashBagPayload) => void add(b), onRemoved: (d: { id: number }) => remove(d.id), onSync: sync, onPicked, onError } }
}
