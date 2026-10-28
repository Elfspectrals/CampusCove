import { computed, ref, shallowRef, watch, type Ref, type WatchStopHandle } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import { matchesRotateCCW, matchesRotateCW } from '../../config/keybindings'
import { createPlacementGhost, DEFAULT_GHOST_COLOR } from '../../game/placement/placementGhost'
import { cuboidOverlapsPlayer, fetchCollisionFile, type CollisionFileJson } from '../../game/collision/worldCollision'
import { propCuboidOf, syncPropBlocker } from '../../game/collision/propBlocker'
import { apartmentObjectIdOf, createPlacementPhysics } from '../../game/placement/placementPhysics'
import type { ApartmentEnvironmentBuildResult } from '../../game/roomEnvironments'
import { houseLayout } from '../../game/town/openHouses'
import { levelAt, type HouseLayout } from '../../game/town/houseLevels'

const POS_SMOOTH_PER_FRAME = 0.35
const YAW_SMOOTH_PER_FRAME = 0.25
const ROT_TAU_S = 0.028
const RAYCAST_MAX = 24
const YAW_STEP = Math.PI / 12
const FLOOR_TOLERANCE = 0.01
const PLACE_HINT = 'LMB place · RMB cancel · R rotate · Shift+R reverse · Esc / E cancel'
const NOT_HERE_HINT = 'Furniture can only be placed in a house you own or hold a key to'

const UP = new THREE.Vector3(0, 1, 0)
const DOWN = new THREE.Vector3(0, -1, 0)

export interface ApartmentPlacementItemDef {
  objectKey: string
  modelGlb?: string
  defaultColor?: string
  variant?: string
}

type ApartmentPlacementState =
  | { kind: 'idle' }
  | { kind: 'preview_new'; itemDef: ApartmentPlacementItemDef; ownedCountRef: Ref<number> }
  /** Moving a placed prop: its mesh is hidden and its body removed until commit / cancel. */
  | { kind: 'preview_existing'; objectId: string; sourceMesh: THREE.Mesh }

export interface ApartmentPlacementDeps {
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.PerspectiveCamera | undefined
  getColyseusRoom: () => Room | null
  getApartmentObjectMesh: (objectId: string) => THREE.Mesh | undefined
  canDecorate: Ref<boolean>
  pointerLocked: Ref<boolean>
  getApartmentInventoryOpen: () => boolean
  persistApartmentTransformForMesh: (mesh: THREE.Mesh, force: boolean) => void
  refreshApartmentInventory: () => void
}

function expSmooth(alphaPerFrame: number, dt: number): number {
  const k = Math.max(0, Math.min(1, alphaPerFrame))
  return 1 - Math.pow(1 - k, dt * 60)
}

function validGhostColor(hex: string | undefined): string {
  return typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : DEFAULT_GHOST_COLOR
}

/** Id of the placed prop an intersected object belongs to ('' for room geometry). */
function propIdOfHit(object: THREE.Object3D): string {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    const id = apartmentObjectIdOf(o)
    if (id) return id
  }
  return ''
}

/**
 * House decoration: aim with the crosshair to preview an item (new from the hotbar, or a placed prop picked
 * up with LMB), rotate it with R, and commit it where it does not overlap anything.
 */
export function useApartmentPlacement(deps: ApartmentPlacementDeps) {
  const currentState = shallowRef<ApartmentPlacementState>({ kind: 'idle' })
  const currentValidity = ref(true)
  const hudHints = ref<string[]>([])
  const crosshairTint = ref<'neutral' | 'valid' | 'invalid'>('neutral')
  const isPreviewing = computed(() => currentState.value.kind !== 'idle')

  const physics = createPlacementPhysics()
  const ghost = createPlacementGhost()
  let apartmentEnvGroup: THREE.Group | null = null
  let roomCollision: Promise<CollisionFileJson | null> | null = null
  let roomBounds: CollisionFileJson['bounds'] = null
  let roomLayout: HouseLayout | null = null
  let watchStopOwned: WatchStopHandle | null = null

  const raycaster = new THREE.Raycaster()
  const ndcCenter = new THREE.Vector2(0, 0)
  const smoothPos = new THREE.Vector3()
  const smoothQuat = new THREE.Quaternion()
  const targetPos = new THREE.Vector3()
  const targetQuat = new THREE.Quaternion()
  const tmpVec = new THREE.Vector3()
  let userYawTarget = 0
  let userYawSmoothed = 0
  /** The ghost may rest on the prop under the crosshair, so that prop is ignored by the overlap test. */
  let supportPropId = ''

  function ensureWorld(): Promise<void> {
    if (!deps.canDecorate.value || !roomCollision) return Promise.resolve()
    const layout = roomLayout
    return roomCollision.then((room) => (room && layout ? physics.ensureReady(room, layout) : undefined))
  }

  function tearDownOwnedWatch(): void {
    watchStopOwned?.()
    watchStopOwned = null
  }

  function toIdle(): void {
    tearDownOwnedWatch()
    ghost.clear()
    ghost.root.removeFromParent()
    currentState.value = { kind: 'idle' }
    ghost.resetFeedback()
    hudHints.value = []
    crosshairTint.value = 'neutral'
    currentValidity.value = true
    userYawTarget = 0
    userYawSmoothed = 0
  }

  function cancelPreview(): void {
    const st = currentState.value
    if (st.kind === 'preview_existing') {
      st.sourceMesh.visible = true
      syncPropBlocker(st.objectId, st.sourceMesh)
      void ensureWorld().then(() => physics.registerProp(st.sourceMesh))
    }
    toIdle()
  }

  /** Put the ghost in the scene, two metres in front of the camera. */
  function showGhost(hint: string): void {
    hudHints.value = [hint]
    crosshairTint.value = 'valid'
    deps.getScene()?.add(ghost.root)
    const cam = deps.getCamera()
    if (!cam) return
    cam.getWorldPosition(smoothPos).addScaledVector(cam.getWorldDirection(tmpVec), 2)
    smoothQuat.copy(cam.quaternion)
    ghost.root.position.copy(smoothPos)
    ghost.root.quaternion.copy(smoothQuat)
  }

  function loadGhostVisual(itemDef: ApartmentPlacementItemDef): void {
    const color = validGhostColor(itemDef.defaultColor)
    ghost.showPlaceholder(color)
    const modelUrl = itemDef.modelGlb?.trim()
    if (!modelUrl) return
    const wanted = currentState.value
    void ghost.upgradeToModel(modelUrl, color, () => currentState.value === wanted)
  }

  /** Also outside a decoratable house: the ghost then stays red, so the player sees what they hold. */
  function startPreviewNew(itemDef: ApartmentPlacementItemDef, ownedCountRef: Ref<number>): void {
    cancelPreview()
    if (ownedCountRef.value <= 0) return
    watchStopOwned = watch(ownedCountRef, (q) => {
      if (currentState.value.kind === 'preview_new' && q <= 0) cancelPreview()
    })
    currentState.value = { kind: 'preview_new', itemDef, ownedCountRef }
    showGhost(deps.canDecorate.value ? PLACE_HINT : NOT_HERE_HINT)
    loadGhostVisual(itemDef)
    void ensureWorld()
  }

  function startPreviewExisting(objectId: string, sourceMesh: THREE.Mesh): void {
    if (!deps.canDecorate.value) return
    cancelPreview()
    void ensureWorld().then(() => {
      physics.unregisterProp(objectId)
      sourceMesh.visible = false
      syncPropBlocker(objectId, null)
      currentState.value = { kind: 'preview_existing', objectId, sourceMesh }
      userYawTarget = new THREE.Euler().setFromQuaternion(sourceMesh.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y
      userYawSmoothed = userYawTarget
      loadGhostVisual({
        objectKey: String(sourceMesh.userData.apartmentObjectKey ?? 'unknown'),
        modelGlb: typeof sourceMesh.userData.apartmentObjectModelGlb === 'string'
          ? sourceMesh.userData.apartmentObjectModelGlb
          : undefined,
      })
      showGhost('LMB commit move · RMB cancel · R rotate · Shift+R reverse · Esc / E cancel')
    })
  }

  // ------------------------------------------------------------ apartment lifecycle

  function registerApartmentEnvironment(build: ApartmentEnvironmentBuildResult): void {
    apartmentEnvGroup = build.group
    physics.setRoomFrame(build.group)
    roomLayout = houseLayout(build.house.key)
    roomCollision = fetchCollisionFile(build.house.interiorCollisionUrl).catch((error: unknown) => {
      console.error('[placement] room collision failed to load, overlaps are not checked', error)
      return null
    })
    void roomCollision.then((room) => {
      roomBounds = room?.bounds ?? null
    })
    void ensureWorld()
  }

  /** Leaving the house: a prop being moved goes back, a new item stays in hand (its ghost turns red). */
  function setPlayerInsideApartment(inside: boolean): void {
    if (inside) return
    if (currentState.value.kind === 'preview_existing') cancelPreview()
    tearDownOwnedWatch()
    physics.dispose()
    apartmentEnvGroup = null
    roomCollision = null
    roomBounds = null
    roomLayout = null
  }

  function registerApartmentProp(mesh: THREE.Mesh): void {
    if (!deps.canDecorate.value) return
    void ensureWorld().then(() => physics.registerProp(mesh))
  }

  function unregisterApartmentProp(objectId: string): void {
    if (!deps.canDecorate.value) {
      physics.unregisterProp(objectId)
      return
    }
    void ensureWorld().then(() => physics.unregisterProp(objectId))
  }

  /** When the server removes an object while we are holding it for reposition. */
  function notifyPropRemovedFromWorld(objectId: string): void {
    const st = currentState.value
    if (st.kind === 'preview_existing' && st.objectId === objectId) cancelPreview()
  }

  // ------------------------------------------------------------ per frame

  function raycastPlacementTargets(camera: THREE.PerspectiveCamera): THREE.Intersection[] {
    const sc = deps.getScene()
    if (!apartmentEnvGroup || !sc) return []
    const st = currentState.value
    const movingId = st.kind === 'preview_existing' ? st.objectId : ''
    const targets: THREE.Object3D[] = [apartmentEnvGroup]
    for (const c of sc.children) {
      const id = apartmentObjectIdOf(c)
      if (c instanceof THREE.Mesh && id && c.visible && id !== movingId) targets.push(c)
    }
    raycaster.setFromCamera(ndcCenter, camera)
    raycaster.far = RAYCAST_MAX
    return raycaster.intersectObjects(targets, true).filter((hit) => !movingId || propIdOfHit(hit.object) !== movingId)
  }

  function ghostInsideRoom(): boolean {
    if (!roomBounds || !roomLayout) return true
    const { x, y, z } = ghostPoseInRoom().position
    const base = y - 0.5
    const level = levelAt(roomLayout, x, z, base, FLOOR_TOLERANCE)
    return x >= roomBounds.minX && x <= roomBounds.maxX && z >= roomBounds.minZ && z <= roomBounds.maxZ
      && level !== null && base <= level.y + level.height
  }

  /** Ghost pose (world) expressed in the room frame, the space placed props are stored in. */
  function ghostPoseInRoom(): { position: THREE.Vector3; quaternion: THREE.Quaternion } {
    const position = ghost.root.position.clone()
    const quaternion = ghost.root.quaternion.clone()
    if (!apartmentEnvGroup) return { position, quaternion }
    apartmentEnvGroup.updateMatrixWorld(true)
    const roomToWorld = apartmentEnvGroup.getWorldQuaternion(new THREE.Quaternion())
    return { position: apartmentEnvGroup.worldToLocal(position), quaternion: roomToWorld.invert().multiply(quaternion) }
  }

  /** Pose that lays the ghost flat against the hit surface, pushed out so its box does not sink into it. */
  function computeTargetFromHit(hit: THREE.Intersection): void {
    const n = hit.face?.normal
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      : UP.clone()
    const align = new THREE.Quaternion().setFromUnitVectors(DOWN, n.clone().negate())
    const yaw = new THREE.Quaternion().setFromAxisAngle(UP, userYawSmoothed)
    targetQuat.copy(align).multiply(yaw)
    ghost.root.position.copy(hit.point)
    ghost.root.quaternion.copy(targetQuat)
    ghost.root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(ghost.root)
    let minAlong = Infinity
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) {
          minAlong = Math.min(minAlong, tmpVec.set(x, y, z).sub(hit.point).dot(n))
        }
      }
    }
    targetPos.copy(hit.point)
    if (Number.isFinite(minAlong)) targetPos.addScaledVector(n, -minAlong + 0.002)
  }

  /** Placed furniture blocks the player, so it must not be dropped onto them. */
  function ghostOverlapsPlayer(): boolean {
    const box = propCuboidOf(ghost.root)
    return box !== null && cuboidOverlapsPlayer(box)
  }

  function tick(dt: number): void {
    ghost.tickFeedback(dt, smoothPos)
    const st = currentState.value
    const movingId = st.kind === 'preview_existing' ? st.objectId : ''
    if (deps.canDecorate.value) physics.syncProps(movingId)

    if (st.kind === 'idle' || !ghost.hasContent()) return
    const cam = deps.getCamera()
    if (!cam) return

    userYawSmoothed += (userYawTarget - userYawSmoothed) * (1 - Math.exp(-dt / ROT_TAU_S))
    const firstHit = raycastPlacementTargets(cam)[0]
    if (firstHit) {
      supportPropId = propIdOfHit(firstHit.object)
      computeTargetFromHit(firstHit)
    } else {
      supportPropId = ''
      const dir = cam.getWorldDirection(tmpVec).normalize()
      targetPos.copy(cam.getWorldPosition(new THREE.Vector3())).addScaledVector(dir, 2.5)
      targetQuat.copy(cam.quaternion)
    }

    smoothPos.lerp(targetPos, expSmooth(POS_SMOOTH_PER_FRAME, dt))
    smoothQuat.slerp(targetQuat, expSmooth(YAW_SMOOTH_PER_FRAME, dt))
    ghost.root.position.copy(smoothPos)
    ghost.root.quaternion.copy(smoothQuat)
    ghost.applyShake()

    const ignored = new Set([movingId, supportPropId].filter(Boolean))
    const valid = deps.canDecorate.value && ghostInsideRoom() && !physics.ghostIntersects(ghost.root, ignored)
      && !ghostOverlapsPlayer()
    if (st.kind === 'preview_new') {
      const hint = deps.canDecorate.value ? PLACE_HINT : NOT_HERE_HINT
      if (hudHints.value[0] !== hint) hudHints.value = [hint]
    }
    if (ghost.setValid(valid)) {
      currentValidity.value = valid
      crosshairTint.value = valid ? 'valid' : 'invalid'
    }
    ghost.updateColors(dt)
  }

  // ------------------------------------------------------------ input

  /** Esc cancels, R / Shift+R rotate by 15°. Returns true when the key was used. */
  function onKeyDown(e: KeyboardEvent): boolean {
    if (e.repeat || currentState.value.kind === 'idle') return false
    if (e.code === 'Escape') cancelPreview()
    else if (matchesRotateCW(e)) userYawTarget += YAW_STEP
    else if (matchesRotateCCW(e)) userYawTarget -= YAW_STEP
    else return false
    return true
  }

  function tryCommitPreview(): void {
    const st = currentState.value
    if (st.kind === 'idle' || !ghost.hasContent()) return
    if (!currentValidity.value || !deps.canDecorate.value) {
      ghost.deny()
      return
    }
    const room = deps.getColyseusRoom()
    if (!room || !deps.canDecorate.value) return

    const pose = ghostPoseInRoom()
    if (st.kind === 'preview_new') {
      const euler = new THREE.Euler().setFromQuaternion(pose.quaternion, 'XYZ')
      room.send('apartment_spawn_request', {
        objectId: crypto.randomUUID(),
        objectKey: st.itemDef.objectKey,
        variant: st.itemDef.variant ?? 'default',
        color: st.itemDef.defaultColor ?? DEFAULT_GHOST_COLOR,
        x: pose.position.x,
        y: pose.position.y - 0.5,
        z: pose.position.z,
        rotX: euler.x,
        rotY: euler.y,
        rotZ: euler.z,
      })
      deps.refreshApartmentInventory()
      cancelPreview()
      return
    }

    const mesh = st.sourceMesh
    mesh.position.copy(pose.position)
    mesh.quaternion.copy(pose.quaternion)
    mesh.visible = true
    toIdle()
    syncPropBlocker(st.objectId, mesh)
    deps.persistApartmentTransformForMesh(mesh, true)
    void ensureWorld().then(() => physics.registerProp(mesh))
  }

  /** Returns true when the click was used for placement (so it must not also open a door). */
  function onPointerDown(e: MouseEvent): boolean {
    if (!deps.pointerLocked.value || deps.getApartmentInventoryOpen()) return false
    if (!deps.canDecorate.value && currentState.value.kind === 'idle') return false
    if (e.button === 2) {
      e.preventDefault()
      cancelPreview()
      return true
    }
    if (e.button !== 0) return false
    if (currentState.value.kind !== 'idle') {
      tryCommitPreview()
      return true
    }
    const cam = deps.getCamera()
    const topHit = cam ? raycastPlacementTargets(cam)[0] : undefined
    if (!topHit) return false
    const id = propIdOfHit(topHit.object)
    if (!id) return false
    const mesh = deps.getApartmentObjectMesh(id)
    if (mesh) startPreviewExisting(id, mesh)
    return true
  }

  function dispose(): void {
    cancelPreview()
    tearDownOwnedWatch()
    physics.dispose()
    apartmentEnvGroup = null
    roomCollision = null
    roomBounds = null
    roomLayout = null
  }

  return {
    hudHints,
    crosshairTint,
    isPreviewing,
    setPlayerInsideApartment,
    registerApartmentEnvironment,
    registerApartmentProp,
    unregisterApartmentProp,
    startPreviewNew,
    cancelPreview,
    notifyPropRemovedFromWorld,
    tick,
    onKeyDown,
    dispose,
    onPointerDown,
  }
}
