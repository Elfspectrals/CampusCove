import { ref, type Ref, type ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import { PUNCH_COOLDOWN_MS, PUNCH_IMPACT_S, pickPunchTarget, type PunchCandidate } from '../../game/punch'
import { HIT_STOP_S, VICTIM_HIT_STOP_S, confirmsFromServer, remoteHitTiming, untilImpactS } from '../../game/punchFeel'
import type { SfxName } from '../../game/sfx'
import { FULL_STAMINA, snapStamina, spendPunchStamina, staminaAt, type StaminaState } from '../../game/stamina'
import type { PunchTiredPayload, UserPunchedPayload } from '../../types/gameRealtime'

const ATTACKER_SHAKE = 0.45
const ATTACKER_JOLT = 0.4
const VICTIM_SHAKE = 0.6
const VICTIM_JOLT = 1
const KNOCKBACK_DISTANCE = 0.6
const TIRED_SHAKE = 0.25
const BREATH_COOLDOWN_MS = 700

export type HitMarkerKind = 'hit' | 'whiff'

interface Arms {
  punch: () => void
  hitStop: (seconds: number) => void
}

export interface PunchDeps {
  gameRoomRef: ShallowRef<Room | null>
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.Camera | undefined
  getArms: () => Arms | null
  myPosition: { x: number; y: number; z: number }
  pointerLocked: Ref<boolean>
  knockedOut: Readonly<Ref<boolean>>
  reducedEffects: Ref<boolean>
  shakeCamera: (amount: number) => void
  kickCamera: () => void
  freezeCamera: (seconds: number) => void
  joltCamera: (dirX: number, dirZ: number, strength: number) => void
  knockBack: (dirX: number, dirZ: number, distance: number) => void
  playSound: (name: SfxName) => void
}

export function usePunch(deps: PunchDeps) {
  const forward = new THREE.Vector3()
  let lastPunchAt = 0
  let predictedHit: boolean | null = null
  let punchDirX = 0
  let punchDirZ = 0
  let markerId = 0
  const hitMarker = ref<{ kind: HitMarkerKind; id: number } | null>(null)
  let staminaState: StaminaState = FULL_STAMINA
  let lastBreathAt = 0

  function candidates(): PunchCandidate[] {
    const scene = deps.getScene()
    if (!scene) return []
    return scene.children
      .filter((c) => c.userData.isRemoteAvatar === true && c.visible && typeof c.userData.sessionId === 'string')
      .map((c) => ({ sessionId: c.userData.sessionId as string, x: c.position.x, feetY: c.position.y, z: c.position.z }))
  }

  function findTarget(): string | null {
    const camera = deps.getCamera()
    if (!camera) return null
    camera.getWorldDirection(forward)
    const feet = { x: deps.myPosition.x, y: deps.myPosition.y - EYE_HEIGHT, z: deps.myPosition.z }
    return pickPunchTarget(feet, forward, candidates())
  }

  function tryPunch(): boolean {
    if (!deps.pointerLocked.value || deps.knockedOut.value) return false
    const now = Date.now()
    if (now - lastPunchAt < PUNCH_COOLDOWN_MS) return true
    const targetSessionId = findTarget()
    const spent = spendPunchStamina(staminaState, now, targetSessionId !== null)
    if (!spent) {
      if (!deps.reducedEffects.value) deps.shakeCamera(TIRED_SHAKE)
      if (now - lastBreathAt >= BREATH_COOLDOWN_MS) {
        lastBreathAt = now
        deps.playSound('breath')
      }
      return true
    }
    staminaState = spent
    lastPunchAt = now
    deps.getArms()?.punch()
    deps.playSound('whoosh')
    deps.gameRoomRef.value?.send('punch', { targetSessionId })
    playPunch(targetSessionId !== null)
    return true
  }

  function playPunch(hit: boolean): void {
    predictedHit = hit
    punchDirX = forward.x
    punchDirZ = forward.z
    if (!deps.reducedEffects.value) deps.kickCamera()
    window.setTimeout(hit ? confirmHit : whiff, PUNCH_IMPACT_S * 1000)
  }

  function showMarker(kind: HitMarkerKind): void {
    markerId += 1
    hitMarker.value = { kind, id: markerId }
  }

  function shake(amount: number, dirX: number, dirZ: number, jolt: number): void {
    if (deps.reducedEffects.value) return
    deps.shakeCamera(amount)
    deps.joltCamera(dirX, dirZ, jolt)
  }

  function confirmHit(): void {
    deps.getArms()?.hitStop(HIT_STOP_S)
    deps.freezeCamera(HIT_STOP_S)
    shake(ATTACKER_SHAKE, punchDirX, punchDirZ, ATTACKER_JOLT)
    showMarker('hit')
  }

  function whiff(): void {
    showMarker('whiff')
  }

  function sincePunchS(): number {
    return (Date.now() - lastPunchAt) / 1000
  }

  function onPunched(data: UserPunchedPayload, mySessionId: string): void {
    if (data.sessionId === mySessionId) {
      if (confirmsFromServer(predictedHit, data.targetSessionId !== null)) {
        window.setTimeout(confirmHit, untilImpactS(sincePunchS()) * 1000)
      }
      predictedHit = null
    }
    if (data.targetSessionId === mySessionId) {
      deps.getArms()?.hitStop(VICTIM_HIT_STOP_S)
      deps.freezeCamera(VICTIM_HIT_STOP_S)
      shake(VICTIM_SHAKE, data.dirX, data.dirZ, VICTIM_JOLT)
      deps.playSound('impact')
      deps.knockBack(data.dirX, data.dirZ, KNOCKBACK_DISTANCE)
    }
  }

  function remoteHitTimingFor(data: UserPunchedPayload, mySessionId: string): { delay: number; hitStop: number } {
    return remoteHitTiming(data.sessionId === mySessionId, sincePunchS())
  }

  function syncStamina(serverStamina: number): void {
    staminaState = snapStamina(staminaState, serverStamina, Date.now())
  }

  function onTired(data: PunchTiredPayload): void {
    syncStamina(data.stamina)
  }

  function staminaNow(): number {
    return staminaAt(staminaState, Date.now())
  }

  return { tryPunch, onPunched, onTired, syncStamina, staminaNow, remoteHitTimingFor, hitMarker }
}
