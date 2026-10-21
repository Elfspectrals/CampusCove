import type * as THREE from 'three'
import { disposeObject3D } from '../../avatar/compositeAvatar'
import { TOWN, type TownLayout } from '../../game/assets/catalog'
import { buildWorldCollisionFromUrl } from '../../game/collision/worldCollision'
import {
  applySceneAtmosphere,
  loadApartmentEnvironment,
  loadTownEnvironment,
  loadWorkEnvironment,
  stripRoomEnvironmentsFromScene,
  type ApartmentEnvironmentBuildResult,
} from '../../game/roomEnvironments'

export interface RoomEnvironmentDeps {
  getScene: () => THREE.Scene | undefined
  getRenderer: () => THREE.WebGLRenderer | undefined
  /** House model key of an apartment template ('housing_<unit_id>'). */
  houseKeyForTemplate: (templateKey: string | undefined) => string | null
  onTownLoaded: (layout: TownLayout) => void
  onInteriorLoaded: (built: ApartmentEnvironmentBuildResult) => void
  onError: (message: string) => void
}

/**
 * The 3D world around the player: the town, or one house / work building interior, with its collision.
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

  /** Town ('city'), or an interior: `workKey` for a work building, else the house matching `templateKey`. */
  function setRoomEnvironment(kind: 'city' | 'apartment', templateKey?: string, workKey?: string | null): void {
    const scene = deps.getScene()
    if (!scene) return
    const token = ++loadToken
    detachCurrent(scene)
    applySceneAtmosphere(scene, kind, deps.getRenderer())

    if (kind === 'city') {
      stripRoomEnvironmentsFromScene(scene)
      void buildWorldCollisionFromUrl(TOWN.collisionUrl).catch((err) => {
        console.warn('[collision] town collision failed', err)
      })
      void loadTownEnvironment()
        .then(({ group, layout }) => {
          deps.onTownLoaded(layout)
          if (token === loadToken) show(scene, group)
        })
        .catch((err) => {
          console.error('[town] load failed', err)
          deps.onError('Could not load the town.')
        })
      return
    }

    const interior = workKey ? loadWorkEnvironment(workKey) : loadApartmentEnvironment(deps.houseKeyForTemplate(templateKey))
    void interior
      .then((built) => {
        if (token !== loadToken) return
        show(scene, built.group)
        void buildWorldCollisionFromUrl(built.house.interiorCollisionUrl).catch((err) => {
          console.warn('[collision] interior collision failed', err)
        })
        deps.onInteriorLoaded(built)
      })
      .catch((err) => {
        console.error('[interior] load failed', err)
        deps.onError('Could not load this building.')
      })
  }

  function disposeRoomEnvironment(): void {
    const scene = deps.getScene()
    if (scene) detachCurrent(scene)
  }

  return { setRoomEnvironment, disposeRoomEnvironment }
}
