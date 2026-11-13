import { onUnmounted, ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { applyCachedBalanceAfterPurchase } from '../../api/session'
import { matches, mouseButtonCode } from '../../config/keybindings'
import { recoveryProgress } from '../../game/clinic'
import { CUFF_HOLD_MS, cellAtDoor, nearestCuffTarget, someoneInside, type CuffCandidate } from '../../game/police/handcuffs'
import type { JailCellLayout } from '../../game/police/jailCell'
import { atFrontDesk, atLockers, type PoliceStationLayout } from '../../game/police/policeStation'
import type { WorldManifest } from '../../game/world/worldManifest'
import type {
  PoliceBountyPayload,
  PoliceCuffCancelledPayload,
  PoliceCuffStartedPayload,
  PoliceCuffsPayload,
  PoliceDutyEndedPayload,
  PoliceErrorPayload,
  PoliceLicenceBoughtPayload,
  PoliceStatePayload,
} from '../../types/gameRealtime'
import type { InteractionSource, ScreenPrompt } from './useInteractionTargets'

const PROMPT_HEIGHT = 1.9

type PromptText = { action: string; detail?: string }

interface RemoteFigure extends CuffCandidate {
  feetY: number
}

export interface PoliceDeps {
  myPosition: { x: number; y: number; z: number }
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  canvasRef: Ref<HTMLCanvasElement | null>
  gameRoomRef: ShallowRef<Room | null>
  promptsHidden: () => boolean
  jailed: () => boolean
  deskPrompt: (price: number) => { action: string; detail: string }
  lockerPrompt: (onDuty: boolean, licensed: boolean) => { action: string; detail?: string }
  errorText: (error: PoliceErrorPayload, price: number | null) => string
  say: (text: string) => void
  onDutyStarted: () => void
  onDutyEnded: (reason: PoliceDutyEndedPayload['reason']) => void
  onLicenceBought: () => void
  onLicenceLost: () => void
  pseudoOf: (sessionId: string) => string
  cuffPrompt: (pseudo: string) => PromptText
  uncuffPrompt: (pseudo: string) => PromptText
  lockUpPrompt: (pseudo: string) => PromptText
  releasePrompt: () => PromptText
  onCuffStarted: (role: 'officer' | 'suspect') => void
  onCuffCancelled: (role: 'officer' | 'suspect', reason: PoliceCuffCancelledPayload['reason']) => void
  onCuffs: (role: 'officer' | 'suspect', data: PoliceCuffsPayload) => void
  onBounty: (data: PoliceBountyPayload) => void
}

export function usePolice(deps: PoliceDeps) {
  const licensed = ref(false)
  const onDuty = ref(false)
  const price = ref<number | null>(null)
  const confirmOpen = ref(false)
  const buying = ref(false)
  const error = ref<string | null>(null)
  const escorting = ref<string | null>(null)
  const cuffedBy = ref<string | null>(null)
  const cuffProgress = ref<number | null>(null)
  const projection = new THREE.Vector3()
  let station: PoliceStationLayout | null = null
  let cells: JailCellLayout[] = []
  let cuffStartedAt: number | null = null

  function onTownLoaded(manifest: WorldManifest): void {
    station = manifest.police ?? null
    cells = manifest.police?.cells ?? []
  }

  function mySessionId(): string | null {
    return deps.gameRoomRef.value?.sessionId ?? null
  }

  function remoteFigures(): RemoteFigure[] {
    const scene = deps.getScene()
    if (!scene) return []
    return scene.children
      .filter((c) => c.userData.isRemoteAvatar === true && c.visible && typeof c.userData.sessionId === 'string')
      .map((c) => ({ sessionId: c.userData.sessionId as string, x: c.position.x, feetY: c.position.y, z: c.position.z }))
  }

  function doorCell(): JailCellLayout | null {
    return onDuty.value && !deps.jailed() ? cellAtDoor(cells, deps.myPosition) : null
  }

  function cuffTarget(): RemoteFigure | null {
    if (!onDuty.value || escorting.value || deps.jailed() || cuffedBy.value) return null
    const figures = remoteFigures()
    const sessionId = nearestCuffTarget(deps.myPosition, figures)
    return figures.find((f) => f.sessionId === sessionId) ?? null
  }

  function stopCuffing(): void {
    cuffStartedAt = null
    cuffProgress.value = null
  }

  function releaseHold(): void {
    if (cuffStartedAt === null) return
    stopCuffing()
    deps.gameRoomRef.value?.send('police_cuff_cancel')
  }

  function tick(): void {
    if (cuffStartedAt === null) return
    if (!onDuty.value) {
      releaseHold()
      return
    }
    cuffProgress.value = recoveryProgress(cuffStartedAt, CUFF_HOLD_MS, performance.now())
  }

  const onKeyUp = (e: KeyboardEvent) => {
    if (matches('interact', e.code)) releaseHold()
  }
  const onMouseUp = (e: MouseEvent) => {
    if (matches('interact', mouseButtonCode(e.button))) releaseHold()
  }
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('blur', releaseHold)
  onUnmounted(() => {
    window.removeEventListener('keyup', onKeyUp)
    window.removeEventListener('mouseup', onMouseUp)
    window.removeEventListener('blur', releaseHold)
  })

  function canBuy(): boolean {
    return station !== null && !licensed.value && price.value !== null && !deps.jailed() && atFrontDesk(station, deps.myPosition)
  }

  function canToggleDuty(): boolean {
    return station !== null && !deps.jailed() && atLockers(station, deps.myPosition)
  }

  function screenPrompt(point: [number, number, number], text: { action: string; detail?: string }): ScreenPrompt | null {
    const camera = deps.getCamera()
    const canvas = deps.canvasRef.value
    if (!camera || !canvas) return null
    projection.set(point[0], point[1] + PROMPT_HEIGHT, point[2]).project(camera)
    if (projection.z > 1) return null
    const rect = canvas.getBoundingClientRect()
    return { x: (projection.x * 0.5 + 0.5) * rect.width, y: (-projection.y * 0.5 + 0.5) * rect.height, ...text }
  }

  function figureOf(sessionId: string): RemoteFigure | null {
    return remoteFigures().find((f) => f.sessionId === sessionId) ?? null
  }

  function arrestPrompt(): ScreenPrompt | null {
    const cell = doorCell()
    const suspect = escorting.value
    if (suspect) {
      const pseudo = deps.pseudoOf(suspect)
      if (cell) return screenPrompt(cell.door, deps.lockUpPrompt(pseudo))
      const figure = figureOf(suspect)
      return figure && screenPrompt([figure.x, figure.feetY, figure.z], deps.uncuffPrompt(pseudo))
    }
    if (cell && someoneInside(cell, remoteFigures())) return screenPrompt(cell.door, deps.releasePrompt())
    if (cuffStartedAt !== null) return null
    const target = cuffTarget()
    return target && screenPrompt([target.x, target.feetY, target.z], deps.cuffPrompt(deps.pseudoOf(target.sessionId)))
  }

  function prompt(): ScreenPrompt | null {
    if (deps.promptsHidden() || confirmOpen.value || !station) return null
    if (canBuy() && price.value !== null) return screenPrompt(station.desk, deps.deskPrompt(price.value))
    if (canToggleDuty()) return screenPrompt(station.lockers, deps.lockerPrompt(onDuty.value, licensed.value))
    return arrestPrompt()
  }

  function interactArrest(room: Room): boolean {
    const cell = doorCell()
    if (escorting.value) {
      room.send(cell ? 'police_cell' : 'police_uncuff')
      return true
    }
    if (cell && someoneInside(cell, remoteFigures())) {
      room.send('police_cell')
      return true
    }
    if (cuffStartedAt !== null) return true
    const target = cuffTarget()
    if (!target) return false
    cuffStartedAt = performance.now()
    cuffProgress.value = 0
    room.send('police_cuff_start', { targetSessionId: target.sessionId })
    return true
  }

  function interact(): boolean {
    const room = deps.gameRoomRef.value
    if (!room) return false
    if (canBuy()) {
      if (document.pointerLockElement) document.exitPointerLock()
      error.value = null
      confirmOpen.value = true
      return true
    }
    if (!canToggleDuty()) return interactArrest(room)
    room.send('police_duty')
    return true
  }

  function confirmBuy(): void {
    if (buying.value) return
    buying.value = true
    error.value = null
    deps.gameRoomRef.value?.send('police_licence_buy')
  }

  function closeConfirm(): void {
    confirmOpen.value = false
    buying.value = false
    error.value = null
  }

  const handlers = {
    onState(data: PoliceStatePayload): void {
      const lostLicence = licensed.value && !data.licensed
      const startedDuty = !onDuty.value && data.onDuty
      licensed.value = data.licensed
      onDuty.value = data.onDuty
      price.value = data.price
      if (startedDuty) deps.onDutyStarted()
      if (lostLicence) deps.onLicenceLost()
    },
    onBought(data: PoliceLicenceBoughtPayload): void {
      if (typeof data.bank === 'number') applyCachedBalanceAfterPurchase('coins', data.bank)
      closeConfirm()
      deps.onLicenceBought()
    },
    onDutyEnded(data: PoliceDutyEndedPayload): void {
      deps.onDutyEnded(data.reason)
    },
    onCuffStarted(data: PoliceCuffStartedPayload): void {
      const me = mySessionId()
      if (data.suspectSessionId === me) deps.onCuffStarted('suspect')
      else if (data.officerSessionId === me) deps.onCuffStarted('officer')
    },
    onCuffCancelled(data: PoliceCuffCancelledPayload): void {
      const me = mySessionId()
      if (data.officerSessionId === me) {
        stopCuffing()
        deps.onCuffCancelled('officer', data.reason)
      } else if (data.suspectSessionId === me) {
        deps.onCuffCancelled('suspect', data.reason)
      }
    },
    onCuffs(data: PoliceCuffsPayload): void {
      const me = mySessionId()
      if (data.officerSessionId === me) {
        stopCuffing()
        escorting.value = data.cuffed ? data.suspectSessionId : null
        deps.onCuffs('officer', data)
      } else if (data.suspectSessionId === me) {
        cuffedBy.value = data.cuffed ? data.officerSessionId : null
        deps.onCuffs('suspect', data)
      }
    },
    onBounty(data: PoliceBountyPayload): void {
      if (typeof data.cash === 'number') applyCachedBalanceAfterPurchase('cash', data.cash)
      deps.onBounty(data)
    },
    onError(data: PoliceErrorPayload): void {
      const text = deps.errorText(data, price.value)
      stopCuffing()
      buying.value = false
      if (confirmOpen.value) error.value = text
      else deps.say(text)
    },
  }

  return {
    licensed,
    onDuty,
    price,
    confirmOpen,
    buying,
    error,
    escorting,
    cuffedBy,
    cuffProgress,
    source: { prompt, interact } as InteractionSource,
    onTownLoaded,
    tick,
    confirmBuy,
    closeConfirm,
    handlers,
  }
}
