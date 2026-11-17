import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import { isAimingAtNpc } from '../../game/pub/npcAim'
import type { Vec3 } from '../../game/mallTemplates/mallTemplate.ts'
import { SPORTS_PASS_DESK_REACH, noPassToastDue, type SportsPassKind } from '../../game/sports/sportsPass'
import type { SportsErrorPayload, SportsPassBoughtPayload, SportsPassStatePayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const PROMPT_HEIGHT = 2.2

export interface SportsPassDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  desks: () => readonly Vec3[]
  deskPrompt: (pass: SportsPassStatePayload) => { action: string; detail: string }
  errorText: (error: SportsErrorPayload) => string
  noPassText: () => string
  say: (text: string) => void
  onBought: () => void
}

export function useSportsPass(deps: SportsPassDeps) {
  const state = shallowRef<SportsPassStatePayload | null>(null)
  const open = ref(false)
  const buying = ref(false)
  const error = ref<string | null>(null)
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()
  let lastNoPassToastAt: number | null = null

  function aimedDesk(): Vec3 | null {
    const camera = deps.getCamera()
    if (!camera) return null
    camera.getWorldDirection(forward)
    return deps.desks().find((desk) => isAimingAtNpc(deps.myPosition, forward, desk, SPORTS_PASS_DESK_REACH)) ?? null
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden() || open.value || !state.value) return null
    const desk = aimedDesk()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!desk || !camera || !canvas) return null
    projection.set(desk[0], desk[1] + PROMPT_HEIGHT, desk[2]).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, ...deps.deskPrompt(state.value) }
  }

  function interact(): boolean {
    if (open.value || !state.value || !aimedDesk()) return false
    if (document.pointerLockElement) document.exitPointerLock()
    error.value = null
    open.value = true
    return true
  }

  function buy(kind: SportsPassKind): void {
    const room = deps.gameRoomRef.value
    if (buying.value || !room) return
    buying.value = true
    error.value = null
    room.send('sports_pass_buy', { kind })
  }

  function close(): void {
    open.value = false
    buying.value = false
    error.value = null
  }

  function onCorrection(reason: string | undefined): void {
    const now = performance.now()
    if (!noPassToastDue(reason, lastNoPassToastAt, now)) return
    lastNoPassToastAt = now
    deps.say(deps.noPassText())
  }

  const handlers = {
    onState(data: SportsPassStatePayload): void {
      state.value = data
    },
    onBought(data: SportsPassBoughtPayload): void {
      applyCachedBalanceAfterPurchase('cash', data.cash)
      if (state.value) state.value = { ...state.value, validUntil: data.validUntil }
      buying.value = false
      deps.onBought()
    },
    onError(data: SportsErrorPayload): void {
      const text = deps.errorText(data)
      buying.value = false
      if (open.value) error.value = text
      else deps.say(text)
    },
  }

  return { state, open, buying, error, buy, close, onCorrection, source: { prompt, interact } as InteractionSource, handlers }
}
