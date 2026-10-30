import * as THREE from 'three'
import { DEFAULT_SLOT_COLORS, type CosmeticColors } from '../../api/characterCosmetics'
import { updateAvatarAnimation } from '../../avatar/glbCharacter'
import { createModularCharacter } from '../../avatar/modularCharacter'
import { WEAR_SLOTS, type WearModels, type WearSlot } from '../../avatar/modularCharacterLogic'
import { setPropBlocker } from '../collision/worldCollision'

export interface ClerkPiece {
  slot: WearSlot
  key: string
}

export interface ClerkSpot {
  position: [number, number, number]
  yaw: number
}

const CLERK_OUTFIT: ClerkPiece[] = [
  { slot: 'hair', key: 'ponytail' },
  { slot: 'top', key: 'tee' },
  { slot: 'bottom', key: 'joggers' },
  { slot: 'shoes', key: 'sneakers' },
]
const CLERK_HEAD_HEIGHT = 2
/** The clerk turns towards a customer closer than this, never further than CLERK_MAX_TURN off the counter. */
const CLERK_NOTICE_RANGE = 6
const CLERK_MAX_TURN = 1.1
const CLERK_TURN_SPEED = 3
const SHOP_FILL = 0.45

export function wearModelUrl(slot: WearSlot, key: string): string {
  return `/assets/wear/${slot}/${key}/model.glb`
}

export function outfitModels(pieces: ClerkPiece[]): WearModels {
  const models = {} as WearModels
  for (const slot of WEAR_SLOTS) models[slot] = null
  for (const piece of pieces) models[piece.slot] = wearModelUrl(piece.slot, piece.key)
  return models
}

export function brightenForShop(character: THREE.Object3D): void {
  character.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    const own = (Array.isArray(obj.material) ? obj.material : [obj.material]).map((m) => {
      const copy = m.clone()
      if (copy instanceof THREE.MeshStandardMaterial) {
        copy.emissive.copy(copy.color).multiplyScalar(SHOP_FILL)
        copy.emissiveMap = copy.map
      }
      return copy
    })
    obj.material = Array.isArray(obj.material) ? own : own[0]!
    obj.userData.sharedMaterials = false
  })
}

/**
 * The shop assistant behind the till, like the clinic nurse: rings up the basket, blocks the way and watches
 * customers. One per store; `colors` are the brand colours of the uniform.
 */
export function createStoreClerk(storeKey: string, colors: CosmeticColors) {
  let clerk: THREE.Group | null = null
  let restYaw = 0
  const head = new THREE.Vector3()
  const toCustomer = new THREE.Vector3()

  async function attach(group: THREE.Group, displays: THREE.Group, spot: ClerkSpot): Promise<void> {
    const character = await createModularCharacter(outfitModels(CLERK_OUTFIT), colors, DEFAULT_SLOT_COLORS)
    brightenForShop(character)
    character.name = 'StoreClerk'
    character.position.fromArray(spot.position)
    character.rotation.y = spot.yaw
    restYaw = spot.yaw
    displays.add(character)
    clerk = character
    group.updateWorldMatrix(true, true)
    head.set(spot.position[0], spot.position[1] + CLERK_HEAD_HEIGHT, spot.position[2]).applyMatrix4(group.matrixWorld)
    const feet = new THREE.Vector3().fromArray(spot.position).applyMatrix4(group.matrixWorld)
    const q = group.getWorldQuaternion(new THREE.Quaternion())
    setPropBlocker(`${storeKey}_clerk`, { cx: feet.x, cy: feet.y + 0.9, cz: feet.z, hx: 0.3, hy: 0.9, hz: 0.3, qx: q.x, qy: q.y, qz: q.z, qw: q.w })
  }

  function update(dt: number, inside: boolean, customerAt: { x: number; z: number }): void {
    if (!clerk?.parent || !inside) return
    const customer = clerk.parent.worldToLocal(toCustomer.set(customerAt.x, 0, customerAt.z))
    const dx = customer.x - clerk.position.x
    const dz = customer.z - clerk.position.z
    let goal = restYaw
    if (Math.hypot(dx, dz) < CLERK_NOTICE_RANGE) {
      const offset = THREE.MathUtils.euclideanModulo(Math.atan2(dx, dz) - restYaw + Math.PI, Math.PI * 2) - Math.PI
      goal = restYaw + THREE.MathUtils.clamp(offset, -CLERK_MAX_TURN, CLERK_MAX_TURN)
    }
    clerk.rotation.y = THREE.MathUtils.damp(clerk.rotation.y, goal, CLERK_TURN_SPEED, dt)
    updateAvatarAnimation(clerk, dt, 0)
  }

  return {
    attach,
    update,
    head,
    get present() {
      return clerk !== null
    },
  }
}
