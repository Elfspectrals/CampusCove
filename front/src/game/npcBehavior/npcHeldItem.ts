import * as THREE from 'three'
import { createPropObject } from '../mallTemplates/templateProps'

/** Where the item sits when the skin has no HandR bone, in the avatar's local frame. */
const FALLBACK_HAND = new THREE.Vector3(0.22, 0.85, 0.12)
/** Drops the item a little below the hand bone so the fingers close around it. */
const GRIP_DROP = 0.05
const handWorld = new THREE.Vector3()

/**
 * A shelf item in a shopper NPC's right hand (docs/NPC_BEHAVIOR.md, `held`): the same model as on the shelf, so the
 * shared template is cloned, not loaded again. Call `update` after the avatar's clips were advanced.
 */
export function createNpcHeldItem(avatar: THREE.Object3D, item: { code: string; key: string }) {
  const hand = avatar.getObjectByName('HandR')
  let model: THREE.Object3D | null = null
  let disposed = false

  void createPropObject({ kind: 'item', id: `held_${item.code}`, key: item.key, code: item.code, forSale: false, position: [0, 0, 0], yaw: 0, scale: [1, 1, 1] })
    .then((object) => {
      if (disposed) return
      object.name = 'npcHeldItem'
      avatar.add(object)
      model = object
      update()
    })
    .catch((error: unknown) => console.error('[npcs] held item failed to load', item.key, error))

  function update(): void {
    if (!model) return
    if (!hand) {
      model.position.copy(FALLBACK_HAND)
      return
    }
    hand.getWorldPosition(handWorld)
    avatar.worldToLocal(handWorld)
    model.position.set(handWorld.x, handWorld.y - GRIP_DROP, handWorld.z)
  }

  function dispose(): void {
    disposed = true
    // the geometry and materials belong to the shared shelf template: only take the clone away
    model?.removeFromParent()
    model = null
  }

  return { update, dispose }
}

export type NpcHeldItem = ReturnType<typeof createNpcHeldItem>
