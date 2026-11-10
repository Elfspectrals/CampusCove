import { onUnmounted, ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { DEFAULT_SLOT_COLORS } from '../../api/characterCosmetics'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import { matches, mouseButtonCode } from '../../config/keybindings'
import { recoveryProgress } from '../../game/clinic'
import {
  APPLE_CODE,
  FARMER_REACH,
  PICK_MS,
  TREE_KEEP_REACH,
  TREE_PROMPT_REACH,
  nearestTree,
  saleLine,
  wholeApples,
  withinReach,
} from '../../game/orchard'
import { isAimingAtNpc } from '../../game/pub/npcAim'
import { createStoreClerk, type ClerkPiece } from '../../game/store/storeClerk'
import type { OrchardLayout, WorldManifest } from '../../game/world/worldManifest'
import type { ApartmentInventoryItem, OrchardErrorPayload, OrchardPickedPayload, OrchardSoldPayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const FARMER_OUTFIT: ClerkPiece[] = [
  { slot: 'hair', key: 'short' },
  { slot: 'head_accessory', key: 'straw_hat' },
  { slot: 'top', key: 'farm_apron' },
  { slot: 'bottom', key: 'dungarees' },
  { slot: 'shoes', key: 'boots' },
]
const FARMER_COLORS = { ...DEFAULT_SLOT_COLORS, hair: '#2e2018', head_accessory: '#d8b56a', top: '#b5362e', bottom: '#41618f', shoes: '#6b4a30' }
const FARMER_PROMPT_HEIGHT = 2.2
const TREE_PROMPT_HEIGHT = 2.4

interface Arms {
  pick: () => void
  cancelPick: () => void
}

export interface OrchardDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  getScene: () => THREE.Scene | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  getArms: () => Arms | null
  promptsHidden: () => boolean
  itemByCode: () => Record<string, ApartmentInventoryItem>
  refreshInventory: () => void
  say: (text: string) => void
}

export function useOrchard(deps: OrchardDeps) {
  const menuOpen = ref(false)
  const selling = ref(false)
  const feedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
  const pickProgress = ref<number | null>(null)
  let layout: OrchardLayout | null = null
  let picking: { tree: number; startedAt: number } | null = null
  const farmer = createStoreClerk('orchard', FARMER_COLORS, { outfit: FARMER_OUTFIT, brighten: false })
  let farmerRoot: THREE.Group | null = null
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()

  function onTownLoaded(manifest: WorldManifest): void {
    layout = manifest.orchard ?? null
    const scene = deps.getScene()
    if (!layout || !scene || farmerRoot) return
    farmerRoot = new THREE.Group()
    farmerRoot.name = 'Orchard'
    scene.add(farmerRoot)
    void farmer.attach(farmerRoot, farmerRoot, { position: layout.farmer, yaw: layout.farmerYaw + Math.PI })
  }

  function carried(): number {
    return wholeApples(deps.itemByCode()[APPLE_CODE])
  }

  function aimingAtFarmer(): boolean {
    const camera = deps.getCamera()
    if (!layout || !camera) return false
    camera.getWorldDirection(forward)
    return isAimingAtNpc(deps.myPosition, forward, layout.farmer, FARMER_REACH)
  }

  function treeInReach(): number | null {
    return layout ? nearestTree(layout.trees, deps.myPosition, TREE_PROMPT_REACH) : null
  }

  function startPick(tree: number): void {
    picking = { tree, startedAt: performance.now() }
    pickProgress.value = 0
    deps.getArms()?.pick()
    deps.gameRoomRef.value?.send('orchard_pick_start', { tree })
  }

  function endPick(): void {
    picking = null
    pickProgress.value = null
  }

  function cancelPick(): void {
    if (!picking) return
    endPick()
    deps.getArms()?.cancelPick()
    deps.gameRoomRef.value?.send('orchard_pick_cancel')
  }

  function openMenu(): void {
    if (document.pointerLockElement) document.exitPointerLock()
    feedback.value = null
    menuOpen.value = true
  }

  function close(): void {
    menuOpen.value = false
  }

  function sell(quantity: number): void {
    if (selling.value) return
    selling.value = true
    deps.gameRoomRef.value?.send('orchard_sell', { quantity })
  }

  function tick(dt: number): void {
    farmer.update(dt, true, deps.myPosition)
    if (!picking || !layout) return
    const tree = layout.trees[picking.tree]
    if (!tree || deps.promptsHidden()) {
      cancelPick()
      return
    }
    if (!withinReach(tree, deps.myPosition, TREE_KEEP_REACH)) {
      cancelPick()
      deps.say('You stepped away from the tree.')
      return
    }
    pickProgress.value = recoveryProgress(picking.startedAt, PICK_MS, performance.now())
    if (pickProgress.value < 1) return
    endPick()
    deps.gameRoomRef.value?.send('orchard_pick')
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

  function onPicked(data: OrchardPickedPayload): void {
    deps.refreshInventory()
    deps.say(`Apple picked · ${data.quantity} in your basket`)
  }

  function onSold(data: OrchardSoldPayload): void {
    selling.value = false
    applyCachedBalanceAfterPurchase('coins', data.balance_after)
    deps.refreshInventory()
    feedback.value = { kind: 'success', text: saleLine(data.coins, data.full_price_left) }
  }

  function onError(data: OrchardErrorPayload): void {
    selling.value = false
    cancelPick()
    if (menuOpen.value) feedback.value = { kind: 'error', text: data.message }
    else deps.say(data.message)
  }

  function projectToScreen(x: number, y: number, z: number): { x: number; y: number } | null {
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return null
    projection.set(x, y, z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height }
  }

  function prompt(): ScreenPrompt | null {
    if (!layout || deps.promptsHidden() || menuOpen.value || picking) return null
    if (aimingAtFarmer()) {
      const [x, y, z] = layout.farmer
      const screen = projectToScreen(x, y + FARMER_PROMPT_HEIGHT, z)
      return screen && { ...screen, action: 'Sell apples', detail: `${carried()} in your basket` }
    }
    const tree = treeInReach()
    if (tree === null) return null
    const [x, y, z] = layout.trees[tree]!
    const screen = projectToScreen(x, y + TREE_PROMPT_HEIGHT, z)
    return screen && { ...screen, action: 'Pick', detail: 'Hold 3 s for an apple' }
  }

  function interact(): boolean {
    if (!layout || menuOpen.value) return false
    if (picking) return true
    if (aimingAtFarmer()) {
      openMenu()
      return true
    }
    const tree = treeInReach()
    if (tree === null) return false
    startPick(tree)
    return true
  }

  const source: InteractionSource = { prompt, interact }

  return {
    menuOpen,
    selling,
    feedback,
    pickProgress,
    carried,
    onTownLoaded,
    sell,
    close,
    tick,
    source,
    handlers: { onPicked, onSold, onError },
  }
}
