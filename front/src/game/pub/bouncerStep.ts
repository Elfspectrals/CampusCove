import * as THREE from 'three'

const BOUNCER_NODE = 'NPC_Bouncer'
const DOOR_NODE = 'Door_Secret'
/** Half a step (m) towards the cellar door, capped by how far the door actually is. */
const STEP_DISTANCE = 0.35
const STEP_IN_S = 0.14
const HOLD_S = 0.35
const STEP_BACK_S = 0.3
export const BOUNCER_STEP_S = STEP_IN_S + HOLD_S + STEP_BACK_S

/** 0 → 1 → 0 over BOUNCER_STEP_S: a quick ease-out step in, a beat in the way, a slower step back. */
export function bouncerStepAmount(t: number): number {
  if (!(t > 0) || t >= BOUNCER_STEP_S) return 0
  if (t < STEP_IN_S) {
    const k = t / STEP_IN_S
    return 1 - (1 - k) ** 3
  }
  if (t < STEP_IN_S + HOLD_S) return 1
  const k = (t - STEP_IN_S - HOLD_S) / STEP_BACK_S
  return 1 - k * k * (3 - 2 * k)
}

/**
 * The bouncer (`NPC_Bouncer`, baked into the pub interior) steps into the cellar doorway and back when someone
 * tries to slip past him (`pub_bouncer_block`). Purely visual: the server already pushed the player back.
 */
export function createBouncerStep(interior: THREE.Object3D) {
  const bouncer = interior.getObjectByName(BOUNCER_NODE)
  if (!bouncer) throw new Error(`Pub interior has no ${BOUNCER_NODE} node`)
  const door = interior.getObjectByName(DOOR_NODE) ?? null
  const rest = bouncer.position.clone()
  const offset = new THREE.Vector3()
  let t = BOUNCER_STEP_S

  function towardDoor(): THREE.Vector3 {
    offset.set(0, 0, 0)
    if (!door || !bouncer!.parent) return offset
    door.getWorldPosition(offset)
    bouncer!.parent.worldToLocal(offset)
    offset.sub(rest).setY(0)
    const distance = offset.length()
    if (distance < 1e-3) return offset.set(0, 0, 0)
    return offset.multiplyScalar(Math.min(STEP_DISTANCE, distance * 0.5) / distance)
  }

  function block(): void {
    towardDoor()
    t = 0
  }

  function update(dt: number): void {
    if (t >= BOUNCER_STEP_S) return
    t += dt
    bouncer!.position.copy(rest).addScaledVector(offset, bouncerStepAmount(t))
  }

  return { block, update }
}
