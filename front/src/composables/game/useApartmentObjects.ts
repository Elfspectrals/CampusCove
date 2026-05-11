import { ref, type Ref } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  TRANSFORM_EPSILON_POSITION,
  TRANSFORM_EPSILON_ROTATION,
} from '../../game/gameRoomConstants'
import type { ApartmentObjectPayload } from '../../types/gameRealtime'
import { disposeObject3D } from '../../avatar/compositeAvatar'

export interface ApartmentObjectsDeps {
  getScene: () => THREE.Scene | undefined
  getGameRoom: () => Room | null
  currentRoomLabel: Ref<'city' | 'apartment'>
  /** After an apartment anchor mesh is created or updated (placement / remote sync). */
  onApartmentObjectMeshUpserted?: (mesh: THREE.Mesh) => void
  /** Before mesh disposal (pickup, room clear, remote delete). */
  onApartmentObjectMeshRemoved?: (objectId: string) => void
  /** Optional: placement system cancels preview if object disappears. */
  onApartmentObjectRemovedNotify?: (objectId: string) => void
}

/** Remote/other apartment mesh UX + transform persistence for placement commits. */
export function useApartmentObjects(deps: ApartmentObjectsDeps) {
  const apartmentObjectCount = ref(0)
  const apartmentObjectIds = ref<string[]>([])
  const selectedPlacedObjectId = ref('')

  const apartmentObjects = new Map<string, THREE.Mesh>()
  const apartmentModelTemplateCache = new Map<string, THREE.Object3D>()
  const apartmentModelLoader = new GLTFLoader()
  const lastPersistedByObjectId = new Map<string, ApartmentObjectPayload>()

  function detachForRoomSwitch() {
    lastPersistedByObjectId.clear()
  }

  function getAnchorMaterial(anchor: THREE.Mesh): THREE.MeshStandardMaterial | null {
    return anchor.material instanceof THREE.MeshStandardMaterial ? anchor.material : null
  }

  function setAnchorCubeVisible(anchor: THREE.Mesh, visible: boolean, colorHex: string) {
    const mat = getAnchorMaterial(anchor)
    if (!mat) return
    mat.color = new THREE.Color(colorHex)
    mat.transparent = !visible
    mat.opacity = visible ? 1 : 0
    mat.needsUpdate = true
  }

  function removeApartmentVisual(anchor: THREE.Mesh) {
    const children = [...anchor.children]
    for (const child of children) {
      const ud = child.userData as { isApartmentVisual?: boolean }
      if (ud.isApartmentVisual === true) {
        anchor.remove(child)
        disposeObject3D(child)
      }
    }
  }

  async function loadApartmentModelTemplate(url: string): Promise<THREE.Object3D | null> {
    const cached = apartmentModelTemplateCache.get(url)
    if (cached) return cached
    try {
      const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
        apartmentModelLoader.load(url, resolve, undefined, reject)
      })
      apartmentModelTemplateCache.set(url, gltf.scene)
      return gltf.scene
    } catch {
      return null
    }
  }

  async function applyApartmentVisual(anchor: THREE.Mesh, payload: ApartmentObjectPayload, colorHex: string) {
    const modelGlb =
      typeof payload.modelGlb === 'string' && payload.modelGlb.trim().length > 0 ? payload.modelGlb.trim() : null
    anchor.userData.apartmentObjectModelGlb = modelGlb
    removeApartmentVisual(anchor)
    if (!modelGlb) {
      setAnchorCubeVisible(anchor, true, colorHex)
      return
    }
    const template = await loadApartmentModelTemplate(modelGlb)
    if (!template) {
      setAnchorCubeVisible(anchor, true, colorHex)
      return
    }
    const latestExpected = anchor.userData.apartmentObjectModelGlb as string | null | undefined
    if (latestExpected !== modelGlb) {
      return
    }
    const visual = template.clone(true)
    const vud = visual.userData as { isApartmentVisual?: boolean }
    vud.isApartmentVisual = true
    visual.position.set(0, -0.5, 0)
    anchor.add(visual)
    setAnchorCubeVisible(anchor, false, colorHex)
  }

  function upsertApartmentObjectMesh(payload: ApartmentObjectPayload, options?: { syncPersistSnapshot?: boolean }) {
    const scene = deps.getScene()
    if (!scene) return

    let mesh = apartmentObjects.get(payload.objectId)
    const colorHex =
      typeof payload.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(payload.color) ? payload.color : '#8B7AA8'
    if (!mesh) {
      const geometry = new THREE.BoxGeometry(1, 1, 1)
      const material = new THREE.MeshStandardMaterial({ color: colorHex })
      mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.userData.apartmentObjectId = payload.objectId
      mesh.userData.apartmentObjectKey = payload.objectKey
      scene.add(mesh)
      apartmentObjects.set(payload.objectId, mesh)
    }
    mesh.userData.apartmentObjectKey = payload.objectKey
    mesh.userData.apartmentObjectModelGlb = typeof payload.modelGlb === 'string' ? payload.modelGlb : null
    setAnchorCubeVisible(mesh, true, colorHex)
    mesh.position.set(payload.x, payload.y + 0.5, payload.z)
    mesh.rotation.set(payload.rotX, payload.rotY, payload.rotZ)
    void applyApartmentVisual(mesh, payload, colorHex)
    if (!apartmentObjectIds.value.includes(payload.objectId)) {
      apartmentObjectIds.value.push(payload.objectId)
    }
    apartmentObjectCount.value = apartmentObjectIds.value.length
    if (selectedPlacedObjectId.value === '') {
      selectedPlacedObjectId.value = payload.objectId
    }
    if (options?.syncPersistSnapshot) {
      lastPersistedByObjectId.set(payload.objectId, payload)
    }
    deps.onApartmentObjectMeshUpserted?.(mesh)
  }

  function removeApartmentObjectMesh(objectId: string) {
    const scene = deps.getScene()
    const mesh = apartmentObjects.get(objectId)
    if (!mesh) return
    deps.onApartmentObjectMeshRemoved?.(objectId)
    deps.onApartmentObjectRemovedNotify?.(objectId)
    if (scene) scene.remove(mesh)
    disposeObject3D(mesh)
    apartmentObjects.delete(objectId)
    apartmentObjectIds.value = apartmentObjectIds.value.filter((id) => id !== objectId)
    apartmentObjectCount.value = apartmentObjectIds.value.length
    lastPersistedByObjectId.delete(objectId)
    if (selectedPlacedObjectId.value === objectId) {
      selectedPlacedObjectId.value = apartmentObjectIds.value[0] ?? ''
    }
  }

  function clearApartmentObjects() {
    const scene = deps.getScene()
    const ids = [...apartmentObjects.keys()]
    for (const objectId of ids) {
      deps.onApartmentObjectMeshRemoved?.(objectId)
      deps.onApartmentObjectRemovedNotify?.(objectId)
    }
    for (const mesh of apartmentObjects.values()) {
      if (scene) scene.remove(mesh)
      disposeObject3D(mesh)
    }
    apartmentObjects.clear()
    apartmentObjectIds.value = []
    apartmentObjectCount.value = 0
    selectedPlacedObjectId.value = ''
    lastPersistedByObjectId.clear()
  }

  function getApartmentObjectMesh(objectId: string): THREE.Mesh | undefined {
    return apartmentObjects.get(objectId)
  }

  function apartmentPayloadFromMesh(objectId: string, objectKey: string, mesh: THREE.Mesh): ApartmentObjectPayload {
    const mat = mesh.material
    const color =
      mat instanceof THREE.MeshStandardMaterial ? `#${mat.color.getHexString().toUpperCase()}` : '#8B7AA8'
    return {
      objectId,
      objectKey,
      modelGlb: typeof mesh.userData.apartmentObjectModelGlb === 'string' ? mesh.userData.apartmentObjectModelGlb : null,
      variant: 'default',
      color,
      x: mesh.position.x,
      y: mesh.position.y - 0.5,
      z: mesh.position.z,
      rotX: mesh.rotation.x,
      rotY: mesh.rotation.y,
      rotZ: mesh.rotation.z,
    }
  }

  function sameTransform(a: ApartmentObjectPayload, b: ApartmentObjectPayload): boolean {
    return (
      Math.abs(a.x - b.x) <= TRANSFORM_EPSILON_POSITION &&
      Math.abs(a.y - b.y) <= TRANSFORM_EPSILON_POSITION &&
      Math.abs(a.z - b.z) <= TRANSFORM_EPSILON_POSITION &&
      Math.abs(a.rotX - b.rotX) <= TRANSFORM_EPSILON_ROTATION &&
      Math.abs(a.rotY - b.rotY) <= TRANSFORM_EPSILON_ROTATION &&
      Math.abs(a.rotZ - b.rotZ) <= TRANSFORM_EPSILON_ROTATION &&
      a.color === b.color &&
      a.variant === b.variant &&
      a.objectKey === b.objectKey
    )
  }

  function persistApartmentTransformForMesh(mesh: THREE.Mesh, force: boolean) {
    const room = deps.getGameRoom()
    if (!room || deps.currentRoomLabel.value !== 'apartment') return
    const objectId = typeof mesh.userData.apartmentObjectId === 'string' ? mesh.userData.apartmentObjectId : ''
    const objectKey = typeof mesh.userData.apartmentObjectKey === 'string' ? mesh.userData.apartmentObjectKey : ''
    if (!objectId || !objectKey) return
    const payload = apartmentPayloadFromMesh(objectId, objectKey, mesh)
    const previous = lastPersistedByObjectId.get(objectId)
    if (!force && previous && sameTransform(payload, previous)) {
      return
    }
    room.send('apartment_transform_request', payload)
    lastPersistedByObjectId.set(objectId, payload)
  }

  function schedulePersistAttachedObject(force = false) {
    void force
    /** Legacy no-op: TransformControls removed — placement commits send transforms explicitly. */
  }

  function ensureApartmentObjectsFromServer(objects: ApartmentObjectPayload[]) {
    clearApartmentObjects()
    for (const obj of objects) {
      upsertApartmentObjectMesh(obj, { syncPersistSnapshot: true })
    }
  }

  function attachSelectedPlacedObject() {
    /** No-op: legacy TransformControls attachment. */
  }

  /** Server-driven upserts (broadcast or init). Updates snapshot used for throttle dedupe. */
  function upsertApartmentObjectFromRemote(payload: ApartmentObjectPayload) {
    upsertApartmentObjectMesh(payload, { syncPersistSnapshot: true })
  }

  /** Clear pending persist timer — call on teardown (no-op; kept for GameView API). */
  function clearPersistTimers() {}

  return {
    apartmentObjectCount,
    apartmentObjectIds,
    selectedPlacedObjectId,
    detachForRoomSwitch,
    clearPersistTimers,
    clearApartmentObjects,
    upsertApartmentObjectMesh,
    upsertApartmentObjectFromRemote,
    removeApartmentObjectMesh,
    ensureApartmentObjectsFromServer,
    attachSelectedPlacedObject,
    schedulePersistAttachedObject,
    persistApartmentTransformForMesh,
    getApartmentObjectMesh,
  }
}
