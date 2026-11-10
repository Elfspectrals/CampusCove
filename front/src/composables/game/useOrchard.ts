import { onUnmounted, ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matches, mouseButtonCode } from '../../config/keybindings'
import { recoveryProgress } from '../../game/clinic'
import {
  PICK_MS,
  TREE_KEEP_REACH,
  TREE_PROMPT_REACH,
  nearestTree,
  withinReach,
} from '../../game/orchard'
import type { OrchardLayout, WorldManifest } from '../../game/world/worldManifest'
import type { OrchardErrorPayload, OrchardPickedPayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const TREE_PROMPT_HEIGHT = 2.4

interface Arms {
  pick: () => void
  cancelPick: () => void
}

export interface OrchardDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  getArms: () => Arms | null
  promptsHidden: () => boolean
  refreshInventory: () => void
  say: (text: string) => void
}

export function useOrchard(deps: OrchardDeps) {
  const pickProgress = ref<number | null>(null)
  let layout: OrchardLayout | null = null
  let picking: { tree: number; startedAt: number } | null = null
  const projection = new THREE.Vector3()

  function onTownLoaded(manifest: WorldManifest): void {
    layout = manifest.orchard ?? null
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

  function tick(dt: number): void {
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

  function onError(data: OrchardErrorPayload): void {
    cancelPick()
    deps.say(data.message)
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
    if (!layout || deps.promptsHidden() || picking) return null
    const tree = treeInReach()
    if (tree === null) return null
    const [x, y, z] = layout.trees[tree]!
    const screen = projectToScreen(x, y + TREE_PROMPT_HEIGHT, z)
    return screen && { ...screen, action: 'Pick', detail: 'Hold 3 s for an apple' }
  }

  function interact(): boolean {
    if (!layout) return false
    if (picking) return true
    const tree = treeInReach()
    if (tree === null) return false
    startPick(tree)
    return true
  }

  const source: InteractionSource = { prompt, interact }

  return {
    pickProgress,
    onTownLoaded,
    tick,
    source,
    handlers: { onPicked, onError },
  }
}
