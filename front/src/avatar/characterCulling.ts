import * as THREE from 'three'

export const CHARACTER_REACH = 2.5

export function cullCharacterOutOfView(character: THREE.Object3D): void {
  character.updateMatrixWorld(true)
  const feet = new THREE.Vector3().setFromMatrixPosition(character.matrixWorld)
  const reach = CHARACTER_REACH * character.matrixWorld.getMaxScaleOnAxis()
  character.traverse((obj) => {
    if (!(obj instanceof THREE.SkinnedMesh)) return
    obj.boundingSphere = new THREE.Sphere(obj.worldToLocal(feet.clone()), reach / obj.matrixWorld.getMaxScaleOnAxis())
    obj.frustumCulled = true
  })
}
