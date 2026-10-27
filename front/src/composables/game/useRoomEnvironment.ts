import type * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { buildWorldCollisionFromData } from '../../game/collision/worldCollision'
import { applySceneAtmosphere, loadTownEnvironment, stripRoomEnvironmentsFromScene } from '../../game/roomEnvironments'
import { buildTownCollisionData } from '../../game/town/openHouses'
import type { WorldManifest } from '../../game/world/worldManifest'

export interface RoomEnvironmentDeps {
  getScene: () => THREE.Scene | undefined
  getRenderer: () => THREE.WebGLRenderer | undefined
  onTownLoaded: (manifest: WorldManifest) => void
  onError: (message: string) => void
}

/**
 * The 3D world around the player (the town with every building interior placed in it) and its collision.
 * Loads are async, so a load token makes sure only the latest requested environment ends up in the scene.
 */
export function useRoomEnvironment(deps: RoomEnvironmentDeps) {
  let current: THREE.Group | null = null
  let loadToken = 0

  function detachCurrent(scene: THREE.Scene): void {
    if (!current) return
    scene.remove(current)
    if (!current.userData.isPersistentEnvironment) disposeObject3D(current)
    current = null
  }

  function show(scene: THREE.Scene, group: THREE.Group): void {
    current = group
    scene.add(group)
  }

  function loadTown(): void {
    const scene = deps.getScene()
    if (!scene) return
    const token = ++loadToken
    detachCurrent(scene)
    applySceneAtmosphere(scene, deps.getRenderer())
    stripRoomEnvironmentsFromScene(scene)
    void loadTownEnvironment()
      .then(({ manifest }) => buildTownCollisionData(manifest))
      .then((data) => buildWorldCollisionFromData('town', data))
      .catch((err) => {
        console.error('[collision] town collision failed', err)
        deps.onError('Could not load the town collision: movement is disabled.')
      })
    void loadTownEnvironment()
      .then(({ group, manifest }) => {
        deps.onTownLoaded(manifest)
        if (token === loadToken) show(scene, group)
      })
      .catch((err) => {
        console.error('[town] load failed', err)
        deps.onError('Could not load the town.')
      })
  }

  function disposeRoomEnvironment(): void {
    const scene = deps.getScene()
    if (scene) detachCurrent(scene)
  }

  return { loadTown, disposeRoomEnvironment }
}
