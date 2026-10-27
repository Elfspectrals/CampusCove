import { ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { giveHouseKeys, takeHouseKeys } from '../../api/housing'
import { KEY_BINDINGS } from '../../config/keybindings'
import type { HousingUnit } from '../../game/town/housing'

const KEY_REACH = 4
const PROMPT_HEIGHT = 2.1

export interface HouseKeysDeps {
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  roomMessage: Ref<string | null>
  myHouse: () => HousingUnit | null
  holdingHouseKey: () => boolean
  promptsHidden: () => boolean
}

interface KeyTarget {
  accountId: number
  pseudo: string
  avatar: THREE.Object3D
}

export interface KeyPrompt {
  x: number
  y: number
  action: string
  detail: string
}

export function useHouseKeys(deps: HouseKeysDeps) {
  const keyPrompt = ref<KeyPrompt | null>(null)
  const raycaster = new THREE.Raycaster()
  const center = new THREE.Vector2(0, 0)
  const head = new THREE.Vector3()
  let target: KeyTarget | null = null
  let inFlight = false

  function avatarOf(object: THREE.Object3D): THREE.Object3D | null {
    for (let o: THREE.Object3D | null = object; o; o = o.parent) {
      if (o.userData.isRemoteAvatar === true) return o
    }
    return null
  }

  function findTarget(): KeyTarget | null {
    const scene = deps.getScene()
    const camera = deps.getCamera()
    if (!scene || !camera || !deps.myHouse() || !deps.holdingHouseKey()) return null
    const avatars = scene.children.filter((c) => c.userData.isRemoteAvatar === true && c.visible)
    if (avatars.length === 0) return null
    raycaster.setFromCamera(center, camera)
    raycaster.far = KEY_REACH
    const hit = raycaster.intersectObjects(avatars, true)[0]
    const avatar = hit ? avatarOf(hit.object) : null
    const accountId = Number(avatar?.userData.userId)
    if (!avatar || !Number.isInteger(accountId)) return null
    return { accountId, pseudo: String(avatar.userData.pseudo ?? ''), avatar }
  }

  function hasKeys(accountId: number): boolean {
    return deps.myHouse()?.key_holder_account_ids.includes(accountId) ?? false
  }

  function updateKeyPrompt(): void {
    target = deps.promptsHidden() ? null : findTarget()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!target || !camera || !canvas) {
      keyPrompt.value = null
      return
    }
    target.avatar.getWorldPosition(head)
    head.y += PROMPT_HEIGHT
    head.project(camera)
    if (head.z > 1) {
      keyPrompt.value = null
      return
    }
    const rect = canvas.getBoundingClientRect()
    keyPrompt.value = {
      x: (head.x * 0.5 + 0.5) * rect.width,
      y: (-head.y * 0.5 + 0.5) * rect.height,
      action: hasKeys(target.accountId) ? 'Take keys' : 'Give keys',
      detail: target.pseudo,
    }
  }

  async function toggleKeys(): Promise<void> {
    const current = target
    if (!current || inFlight) return
    inFlight = true
    deps.roomMessage.value = null
    try {
      if (hasKeys(current.accountId)) await takeHouseKeys(current.accountId)
      else await giveHouseKeys(current.accountId)
      deps.gameRoomRef.value?.send('housing_refresh')
    } catch (err) {
      deps.roomMessage.value = err instanceof Error ? err.message : 'Could not change the keys.'
    } finally {
      inFlight = false
    }
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (e.code !== KEY_BINDINGS.houseKeys || e.repeat || !target) return false
    void toggleKeys()
    return true
  }

  return { keyPrompt, updateKeyPrompt, onKeyDown }
}
