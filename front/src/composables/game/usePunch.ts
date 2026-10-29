import type { Ref, ShallowRef } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { EYE_HEIGHT } from '../../game/gameRoomConstants'
import { PUNCH_COOLDOWN_MS, PUNCH_IMPACT_S, pickPunchTarget, type PunchCandidate } from '../../game/punch'
import type { UserPunchedPayload } from '../../types/gameRealtime'

const HIT_STOP_S = 0.07
const ATTACKER_SHAKE = 0.2
const VICTIM_SHAKE = 0.6
const KNOCKBACK_DISTANCE = 0.6

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
  knockedOut: Ref<boolean>
  reducedEffects: Ref<boolean>
  shakeCamera: (amount: number) => void
  knockBack: (dirX: number, dirZ: number, distance: number) => void
}

export function usePunch(deps: PunchDeps) {
  const forward = new THREE.Vector3()
  let lastPunchAt = 0

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
    lastPunchAt = now
    deps.getArms()?.punch()
    deps.gameRoomRef.value?.send('punch', { targetSessionId: findTarget() })
    return true
  }

  function shake(amount: number): void {
    if (!deps.reducedEffects.value) deps.shakeCamera(amount)
  }

  function confirmHit(): void {
    deps.getArms()?.hitStop(HIT_STOP_S)
    shake(ATTACKER_SHAKE)
  }

  function onPunched(data: UserPunchedPayload, mySessionId: string): void {
    if (data.sessionId === mySessionId && data.targetSessionId) {
      const untilImpact = PUNCH_IMPACT_S * 1000 - (Date.now() - lastPunchAt)
      window.setTimeout(confirmHit, Math.max(0, untilImpact))
    }
    if (data.targetSessionId === mySessionId) {
      shake(VICTIM_SHAKE)
      deps.knockBack(data.dirX, data.dirZ, KNOCKBACK_DISTANCE)
    }
  }

  return { tryPunch, onPunched }
}
