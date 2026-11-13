import { ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { actionKeyLabels, matches, type BindableAction } from '../../config/keybindings'
import { victimInFront, type PickpocketCandidate } from '../../game/police/pickpocket'
import type {
  PickpocketAlertPayload,
  PickpocketErrorPayload,
  PickpocketFailedPayload,
  PickpocketLootItem,
  PickpocketLootPayload,
  PickpocketMissingPayload,
  PickpocketProgressPayload,
  PickpocketStartedPayload,
  PickpocketSucceededPayload,
  PickpocketTakenPayload,
  PickpocketWindow,
} from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const PROMPT_HEIGHT = 1.9
const LOOT_KEYS: BindableAction[] = ['hotbar1', 'hotbar2', 'hotbar3', 'hotbar4', 'hotbar5', 'hotbar6', 'hotbar7', 'hotbar8', 'hotbar9']

export interface PickpocketGameView {
  victimPseudo: string
  windows: PickpocketWindow[]
  halfSweepMs: number
  durationMs: number
  startedAt: number
  stops: number
}

export interface PickpocketLootView {
  items: PickpocketLootItem[]
  endsAt: number
}

export interface PickpocketDeps {
  myPosition: { x: number; y: number; z: number }
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  blocked: () => boolean
  pseudoOf: (sessionId: string) => string
  prompt: (pseudo: string) => { action: string; detail: string }
  say: (text: string) => void
  failedText: (reason: PickpocketFailedPayload['reason']) => string
  succeededText: (witnessed: boolean) => string
  takenText: (data: PickpocketTakenPayload) => string
  lootClosedText: () => string
  alertText: (data: PickpocketAlertPayload) => string
  missingText: (data: PickpocketMissingPayload) => string
  errorText: (error: PickpocketErrorPayload) => string
  onInventoryChanged: () => void
  onStopped: () => void
  onCaught: () => void
}

export function usePickpocket(deps: PickpocketDeps) {
  const game = ref<PickpocketGameView | null>(null)
  const loot = ref<PickpocketLootView | null>(null)
  const projection = new THREE.Vector3()

  function candidates(): PickpocketCandidate[] {
    const scene = deps.getScene()
    if (!scene) return []
    return scene.children
      .filter((c) => c.userData.isRemoteAvatar === true && c.visible && typeof c.userData.sessionId === 'string')
      .map((c) => ({ sessionId: c.userData.sessionId as string, x: c.position.x, feetY: c.position.y, z: c.position.z, ry: c.rotation.y - Math.PI }))
  }

  function target(): PickpocketCandidate | null {
    if (game.value || loot.value || deps.blocked()) return null
    return victimInFront(deps.myPosition, candidates())
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden()) return null
    const victim = target()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!victim || !camera || !canvas) return null
    projection.set(victim.x, victim.feetY + PROMPT_HEIGHT, victim.z).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (projection.x * 0.5 + 0.5) * rect.width,
      y: (-projection.y * 0.5 + 0.5) * rect.height,
      key: actionKeyLabels('pickpocket')[0],
      ...deps.prompt(deps.pseudoOf(victim.sessionId)),
    }
  }

  function take(code: string): void {
    if (!loot.value) return
    deps.gameRoomRef.value?.send('pickpocket_take', { code })
  }

  function onKeyDown(e: KeyboardEvent): boolean {
    if (e.repeat) return false
    if (loot.value) {
      const index = LOOT_KEYS.findIndex((action) => matches(action, e.code))
      const item = index >= 0 ? loot.value.items[index] : undefined
      if (!item) return false
      take(item.code)
      return true
    }
    if (!matches('pickpocket', e.code)) return false
    const room = deps.gameRoomRef.value
    if (!room) return false
    if (game.value) {
      room.send('pickpocket_stop')
      return true
    }
    const victim = target()
    if (!victim) return false
    room.send('pickpocket_start', { targetSessionId: victim.sessionId })
    return true
  }

  function clearLootAfter(view: PickpocketLootView): void {
    window.setTimeout(() => {
      if (loot.value?.endsAt === view.endsAt) loot.value = null
    }, Math.max(0, view.endsAt - performance.now()))
  }

  const handlers = {
    onStarted(data: PickpocketStartedPayload): void {
      game.value = {
        victimPseudo: deps.pseudoOf(data.victimSessionId),
        windows: data.windows,
        halfSweepMs: data.halfSweepMs,
        durationMs: data.durationMs,
        startedAt: performance.now(),
        stops: 0,
      }
    },
    onProgress(data: PickpocketProgressPayload): void {
      if (!game.value) return
      game.value.stops = data.stops
      deps.onStopped()
    },
    onFailed(data: PickpocketFailedPayload): void {
      game.value = null
      if (data.reason !== 'cancelled') deps.onCaught()
      deps.say(deps.failedText(data.reason))
    },
    onSucceeded(data: PickpocketSucceededPayload): void {
      game.value = null
      deps.say(deps.succeededText(data.witnessed))
    },
    onLoot(data: PickpocketLootPayload): void {
      const view = { items: data.items, endsAt: performance.now() + data.durationMs }
      loot.value = view
      clearLootAfter(view)
    },
    onTaken(data: PickpocketTakenPayload): void {
      loot.value = null
      deps.say(deps.takenText(data))
      deps.onInventoryChanged()
    },
    onLootClosed(): void {
      if (!loot.value) return
      loot.value = null
      deps.say(deps.lootClosedText())
    },
    onAlert(data: PickpocketAlertPayload): void {
      deps.say(deps.alertText(data))
    },
    onMissing(data: PickpocketMissingPayload): void {
      deps.say(deps.missingText(data))
      deps.onInventoryChanged()
    },
    onError(data: PickpocketErrorPayload): void {
      deps.say(deps.errorText(data))
    },
  }

  return {
    game,
    loot,
    source: { prompt, interact: () => false } as InteractionSource,
    onKeyDown,
    take,
    handlers,
  }
}
