import { ref, watch, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import { isAimingAtNurse } from '../../game/clinic'
import { FULL_STATS } from '../../game/survival'
import type { WorldManifest } from '../../game/world/worldManifest'
import type { ScreenPrompt } from './useInteractionTargets'

const NURSE_PROMPT_HEIGHT = 2
const CONSULTATION_COINS = 30

type ClinicLayout = NonNullable<WorldManifest['clinic']>

export interface ClinicDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  health: () => number | null
  say: (text: string) => void
}

export function useClinic(deps: ClinicDeps) {
  const prompt = ref<ScreenPrompt | null>(null)
  let layout: ClinicLayout | null = null
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()

  function onTownLoaded(manifest: WorldManifest): void {
    layout = manifest.clinic ?? null
  }

  watch(deps.gameRoomRef, (room) => {
    room?.onMessage('clinic_healed', (data: { billed: number; balanceAfter: number | null }) => {
      if (typeof data.balanceAfter === 'number') applyCachedBalanceAfterPurchase('coins', data.balanceAfter)
      deps.say(`The nurse patched you up: full health for ${data.billed} coins.`)
    })
  })

  function canConsult(): boolean {
    const health = deps.health()
    return health !== null && health < FULL_STATS.health
  }

  function isAimingNurse(): boolean {
    const camera = deps.getCamera()
    if (!layout || !camera) return false
    camera.getWorldDirection(forward)
    return isAimingAtNurse(deps.myPosition, forward, layout.nurse)
  }

  function tryInteract(): boolean {
    if (isAimingNurse()) {
      if (canConsult()) deps.gameRoomRef.value?.send('clinic_heal')
      else deps.say('The nurse checks you over: you are in full health, nothing to treat.')
      return true
    }
    return false
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

  function currentPrompt(): ScreenPrompt | null {
    if (!layout || deps.promptsHidden()) return null
    if (isAimingNurse()) {
      const [nx, ny, nz] = layout.nurse
      const screen = projectToScreen(nx, ny + NURSE_PROMPT_HEIGHT, nz)
      const detail = canConsult() ? `${CONSULTATION_COINS} coins (full heal)` : 'You are in full health'
      return screen && { ...screen, action: 'Consultation', detail }
    }
    return null
  }

  function updatePrompt(): void {
    prompt.value = currentPrompt()
  }

  return { prompt, onTownLoaded, tryInteract, updatePrompt }
}
