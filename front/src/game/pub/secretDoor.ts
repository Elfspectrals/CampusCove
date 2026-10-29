import type * as THREE from 'three'
import { setInteriorColliderBlocked } from '../town/openHouses'

const DOOR_NODE = 'Door_Secret'
const DOOR_COLLIDER = 'COL_Door_Secret'
const OPEN_ANGLE = 1.4
const SWING_SPEED = 3
const BELL_SWING_S = 1.6
const BELL_ANGLE = 0.35
const BELL_HZ = 5

/**
 * The staff door behind the bouncer (`Door_Secret`, hinged, closed by default) and the "last orders" bell.
 * The server decides when the door opens (`pub_secret_door`); the collider `COL_Door_Secret` is lifted while
 * it is open so the players it let in can walk through.
 */
export function createSecretDoor(interior: THREE.Group, lotKey: string) {
  const door = interior.getObjectByName(DOOR_NODE)
  if (!door) throw new Error(`Pub interior has no ${DOOR_NODE} node`)
  const bell = interior.getObjectByName('Bell') ?? null
  const bellRest = bell?.rotation.z ?? 0
  let open = false
  let swing = 0
  let bellLeft = 0

  function setOpen(next: boolean): void {
    open = next
  }

  function ring(): void {
    bellLeft = BELL_SWING_S
  }

  function update(dt: number): void {
    setInteriorColliderBlocked(lotKey, DOOR_COLLIDER, !open)
    const target = open ? OPEN_ANGLE : 0
    const step = SWING_SPEED * dt
    const delta = target - swing
    swing = Math.abs(delta) <= step ? target : swing + Math.sign(delta) * step
    door!.rotation.y = swing
    if (!bell || bellLeft <= 0) return
    bellLeft = Math.max(0, bellLeft - dt)
    const fade = bellLeft / BELL_SWING_S
    bell.rotation.z = bellRest + Math.sin(bellLeft * BELL_HZ * Math.PI * 2) * BELL_ANGLE * fade
  }

  return { setOpen, ring, update }
}
