import * as THREE from 'three'
import { aimBone } from '../remotePunch'
import { racePintPose } from './raceBoard'

/** Pint size (m): a nonic glass, a bit oversized so it reads from across the bar. */
const GLASS_RADIUS_TOP = 0.05
const GLASS_RADIUS_BOTTOM = 0.038
const GLASS_HEIGHT = 0.16
const LIQUID_INSET = 0.006
const FOAM_HEIGHT = 0.018
/** Static skins (no HandR bone): the glass floats where a seated hand would be, in the avatar's local frame. */
const FALLBACK_HAND = new THREE.Vector3(0.2, 0.85, 0.28)
const FALLBACK_RAISE = 0.38
/** How much of the arm pose replaces the animation clip's (the Sit clip keeps the rest). */
const ARM_WEIGHT = 0.9

/** Own geometries and materials per pint (a handful of racers at most): disposing the avatar can't break another. */
function pintParts() {
  return {
    glass: new THREE.CylinderGeometry(GLASS_RADIUS_TOP, GLASS_RADIUS_BOTTOM, GLASS_HEIGHT, 12, 1, true),
    liquid: new THREE.CylinderGeometry(GLASS_RADIUS_TOP - LIQUID_INSET, GLASS_RADIUS_BOTTOM - LIQUID_INSET, 1, 12),
    foam: new THREE.CylinderGeometry(GLASS_RADIUS_TOP - LIQUID_INSET, GLASS_RADIUS_TOP - LIQUID_INSET, FOAM_HEIGHT, 12),
    glassMat: new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.32, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    liquidMat: new THREE.MeshStandardMaterial({ color: 0x1a0f0a, roughness: 0.4 }),
    foamMat: new THREE.MeshStandardMaterial({ color: 0xf3e9d2, roughness: 0.9 }),
  }
}

const forward = new THREE.Vector3()
const upperDirection = new THREE.Vector3()
const lowerDirection = new THREE.Vector3()
const handWorld = new THREE.Vector3()
const UP = new THREE.Vector3(0, 1, 0)

/**
 * A pint in another player's right hand while they race Drink Fast: the arm comes up to the mouth and the glass
 * tips back in sips, emptier as their `progress` grows. Call `update` every frame AFTER the avatar's animation
 * clips were advanced (it overrides the arm bones the clip just posed); `dispose` takes it away.
 */
export function createRacePint(avatar: THREE.Object3D) {
  const parts = pintParts()
  const pint = new THREE.Group()
  pint.name = 'racePint'
  const glass = new THREE.Mesh(parts.glass, parts.glassMat)
  glass.position.y = GLASS_HEIGHT / 2
  const liquid = new THREE.Mesh(parts.liquid, parts.liquidMat)
  const foam = new THREE.Mesh(parts.foam, parts.foamMat)
  pint.add(liquid, foam, glass)
  avatar.add(pint)

  const upper = avatar.getObjectByName('UpperArmR')
  const lower = avatar.getObjectByName('LowerArmR')
  const hand = avatar.getObjectByName('HandR')
  let elapsed = 0
  let progress = 0

  function fill(level: number): void {
    const height = Math.max(0.004, (GLASS_HEIGHT - FOAM_HEIGHT) * level)
    liquid.scale.y = height
    liquid.position.y = height / 2
    foam.visible = level > 0.02
    foam.position.y = height + FOAM_HEIGHT / 2
  }
  fill(1)

  function poseArm(lift: number): void {
    if (!upper || !lower || !hand) return
    forward.set(Math.sin(avatar.rotation.y), 0, Math.cos(avatar.rotation.y))
    upperDirection.copy(forward).multiplyScalar(0.75).addScaledVector(UP, -0.55).normalize()
    lowerDirection.copy(forward).multiplyScalar(0.25).add(UP).normalize()
    aimBone(upper, lower, upperDirection, ARM_WEIGHT * lift)
    aimBone(lower, hand, lowerDirection, ARM_WEIGHT * lift)
  }

  return {
    setProgress(value: number): void {
      progress = Math.min(1, Math.max(0, value))
      fill(1 - progress)
    },
    update(dt: number): void {
      elapsed += dt
      const pose = racePintPose(elapsed, progress)
      poseArm(pose.lift)
      if (hand) {
        hand.getWorldPosition(handWorld)
        avatar.worldToLocal(handWorld)
        pint.position.copy(handWorld)
      } else {
        pint.position.copy(FALLBACK_HAND)
        pint.position.y += FALLBACK_RAISE * pose.lift
      }
      // the rim tips back towards the face (avatars face +Z in their own frame)
      pint.rotation.set(-pose.tilt, 0, 0)
    },
    dispose(): void {
      pint.removeFromParent()
      for (const resource of Object.values(parts)) resource.dispose()
    },
  }
}

export type RacePint = ReturnType<typeof createRacePint>
