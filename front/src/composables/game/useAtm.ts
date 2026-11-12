import { ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { fetchBankScreen, type BankScreen } from '../../api/bank'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import type { Vec3 } from '../../game/mallTemplates/mallTemplate.ts'
import { isAimingAtNpc } from '../../game/pub/npcAim'
import type { AtmDonePayload, AtmErrorPayload } from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const ATM_REACH = 2.3
const ANSWER_TIMEOUT_MS = 10_000
const PROMPT_HEIGHT = 2.1

export type AtmOperation = { action: 'withdraw' | 'deposit'; amount: number } | { action: 'transfer'; amount: number; username: string; tag: number }

export interface AtmDeps {
  myPosition: { x: number; y: number; z: number }
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  atms: () => readonly Vec3[]
  promptLabel: () => string
  timeoutMessage: () => string
}

export function useAtm(deps: AtmDeps) {
  const open = ref(false)
  const screen = shallowRef<BankScreen | null>(null)
  const pending = ref(false)
  const feedback = ref<{ kind: 'success' | 'error'; text: string } | null>(null)
  const forward = new THREE.Vector3()
  const projection = new THREE.Vector3()
  let request = 0
  let answerTimer: ReturnType<typeof setTimeout> | undefined

  function aimed(): Vec3 | null {
    const camera = deps.getCamera()
    if (!camera) return null
    camera.getWorldDirection(forward)
    return deps.atms().find((atm) => isAimingAtNpc(deps.myPosition, forward, atm, ATM_REACH)) ?? null
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden() || open.value) return null
    const atm = aimed()
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!atm || !camera || !canvas) return null
    projection.set(atm[0], atm[1] + PROMPT_HEIGHT, atm[2]).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, action: deps.promptLabel() }
  }

  async function reload(): Promise<void> {
    try {
      screen.value = await fetchBankScreen()
    } catch (err) {
      feedback.value = { kind: 'error', text: err instanceof Error ? err.message : String(err) }
    }
  }

  function interact(): boolean {
    if (open.value || !aimed()) return false
    if (document.pointerLockElement) document.exitPointerLock()
    feedback.value = null
    screen.value = null
    open.value = true
    void reload()
    return true
  }

  function settle(): void {
    clearTimeout(answerTimer)
    pending.value = false
  }

  function run(operation: AtmOperation): void {
    const room = deps.gameRoomRef.value
    if (pending.value || !room) return
    pending.value = true
    feedback.value = null
    request += 1
    answerTimer = setTimeout(() => {
      pending.value = false
      feedback.value = { kind: 'error', text: deps.timeoutMessage() }
    }, ANSWER_TIMEOUT_MS)
    room.send('atm', { ...operation, ref: crypto.randomUUID(), request })
  }

  function onDone(data: AtmDonePayload): void {
    if (data.request !== request) return
    settle()
    applyCachedBalanceAfterPurchase('coins', data.bank)
    if (typeof data.cash === 'number') applyCachedBalanceAfterPurchase('cash', data.cash)
    feedback.value = { kind: 'success', text: data.action }
    void reload()
  }

  function onError(data: AtmErrorPayload): void {
    if (data.request !== request) return
    settle()
    feedback.value = { kind: 'error', text: data.message }
  }

  function clearFeedback(): void {
    feedback.value = null
  }

  function close(): void {
    open.value = false
  }

  const source: InteractionSource = { prompt, interact }

  return { open, screen, pending, feedback, run, clearFeedback, close, source, handlers: { onDone, onError } }
}
