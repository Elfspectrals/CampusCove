import { computed, ref, shallowRef, watch, type Ref, type WatchStopHandle } from 'vue'
import type { Room } from '@colyseus/sdk'
import * as THREE from 'three'
import * as RAPIER from '@dimforge/rapier3d-compat'
import type { Collider, World } from '@dimforge/rapier3d-compat'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  APARTMENT_DOOR_POS,
  APARTMENT_HALF_EXTENT,
  APARTMENT_ROOM_HEIGHT,
  APARTMENT_WALL_THICKNESS,
} from '../../game/gameRoomConstants'
import type { ApartmentEnvironmentBuildResult } from '../../game/roomEnvironments'
import { disposeObject3D } from '../../avatar/compositeAvatar'

const VALID_COLOR = 0x00ff88
const VALID_EMISSIVE = 0x00ff88
const VALID_EMISSIVE_INT = 1.2
const VALID_OPACITY_BASE = 0.7

const INVALID_COLOR = 0xff3344
const INVALID_EMISSIVE = 0xff3344
const INVALID_EMISSIVE_INT = 1.4
const INVALID_OPACITY_BASE = 0.65

const GHOST_RENDER_ORDER = 999

const POS_SMOOTH_PER_FRAME = 0.35
const YAW_SMOOTH_PER_FRAME = 0.25
const VALIDITY_COLOR_BLEND_MS = 120
const DENY_SHAKE_MS = 150
const ROT_TAU_S = 0.028

const RAYCAST_MAX = 24

export interface ApartmentPlacementItemDef {
  objectKey: string
  modelGlb?: string
  defaultColor?: string
  variant?: string
}

interface PropPhysicsUserData {
  kind: 'apartmentPlacementProp'
  objectId: string
}

function isPropPhysicsUserData(v: unknown): v is PropPhysicsUserData {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as PropPhysicsUserData).kind === 'apartmentPlacementProp' &&
    typeof (v as PropPhysicsUserData).objectId === 'string'
  )
}

interface StaticPhysicsUserData {
  kind: 'apartmentPlacementStatic'
  subkind: 'floor' | 'ceiling' | 'wall' | 'door'
}

function isStaticPhysicsUserData(v: unknown): v is StaticPhysicsUserData {
  return (
    typeof v === 'object' &&
    v !== null &&
    (v as StaticPhysicsUserData).kind === 'apartmentPlacementStatic' &&
    typeof (v as StaticPhysicsUserData).subkind === 'string'
  )
}

function expSmooth(alphaPerFrame: number, dt: number): number {
  const k = Math.max(0, Math.min(1, alphaPerFrame))
  return 1 - Math.pow(1 - k, dt * 60)
}

/** Local AABB of mesh hierarchy; half extents and center in mesh root space (matches physics gun). */
export function computePlacementLocalAabb(root: THREE.Object3D): { halfExtents: THREE.Vector3; centerLocal: THREE.Vector3 } {
  const box = new THREE.Box3()
  const corner = new THREE.Vector3()
  root.updateMatrixWorld(true)
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert()
  let found = false
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      const geom = obj.geometry
      if (!geom.boundingBox) geom.computeBoundingBox()
      const bb = geom.boundingBox
      if (!bb) return
      const { min, max } = bb
      for (const [x, y, z] of [
        [min.x, min.y, min.z],
        [max.x, min.y, min.z],
        [min.x, max.y, min.z],
        [max.x, max.y, min.z],
        [min.x, min.y, max.z],
        [max.x, min.y, max.z],
        [min.x, max.y, max.z],
        [max.x, max.y, max.z],
      ] as const) {
        corner.set(x, y, z).applyMatrix4(obj.matrixWorld).applyMatrix4(invRoot)
        box.expandByPoint(corner)
        found = true
      }
    }
  })
  if (!found) {
    box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1))
  }
  const centerLocal = box.getCenter(new THREE.Vector3())
  const halfExtents = box.getSize(new THREE.Vector3()).multiplyScalar(0.5)
  const minHalf = 0.04
  halfExtents.x = Math.max(halfExtents.x, minHalf)
  halfExtents.y = Math.max(halfExtents.y, minHalf)
  halfExtents.z = Math.max(halfExtents.z, minHalf)
  return { halfExtents, centerLocal }
}

function addApartmentStaticColliders(w: World): void {
  const h = APARTMENT_ROOM_HEIGHT
  const t = APARTMENT_WALL_THICKNESS
  const floor = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -t / 2, 0))
  const sudFloor: StaticPhysicsUserData = { kind: 'apartmentPlacementStatic', subkind: 'floor' }
  floor.userData = sudFloor as unknown
  w.createCollider(RAPIER.ColliderDesc.cuboid(APARTMENT_HALF_EXTENT, t / 2, APARTMENT_HALF_EXTENT), floor)
  const ceiling = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, h + t / 2, 0))
  const sudCeil: StaticPhysicsUserData = { kind: 'apartmentPlacementStatic', subkind: 'ceiling' }
  ceiling.userData = sudCeil as unknown
  w.createCollider(RAPIER.ColliderDesc.cuboid(APARTMENT_HALF_EXTENT, t / 2, APARTMENT_HALF_EXTENT), ceiling)
  const wallN = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, h / 2, -APARTMENT_HALF_EXTENT))
  const sudWall: StaticPhysicsUserData = { kind: 'apartmentPlacementStatic', subkind: 'wall' }
  wallN.userData = sudWall as unknown
  w.createCollider(RAPIER.ColliderDesc.cuboid(APARTMENT_HALF_EXTENT, h / 2, t / 2), wallN)
  const wallS = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, h / 2, APARTMENT_HALF_EXTENT))
  wallS.userData = sudWall as unknown
  w.createCollider(RAPIER.ColliderDesc.cuboid(APARTMENT_HALF_EXTENT, h / 2, t / 2), wallS)
  const wallW = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-APARTMENT_HALF_EXTENT, h / 2, 0))
  wallW.userData = sudWall as unknown
  w.createCollider(RAPIER.ColliderDesc.cuboid(t / 2, h / 2, APARTMENT_HALF_EXTENT), wallW)
  const wallE = w.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(APARTMENT_HALF_EXTENT, h / 2, 0))
  wallE.userData = sudWall as unknown
  w.createCollider(RAPIER.ColliderDesc.cuboid(t / 2, h / 2, APARTMENT_HALF_EXTENT), wallE)
  const door = w.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(APARTMENT_DOOR_POS.x, 1.1, APARTMENT_DOOR_POS.z),
  )
  const sudDoor: StaticPhysicsUserData = { kind: 'apartmentPlacementStatic', subkind: 'door' }
  door.userData = sudDoor as unknown
  w.createCollider(RAPIER.ColliderDesc.cuboid(0.6, 1.1, 0.05), door)
}

export type ApartmentPlacementStateKind = 'idle' | 'preview_new' | 'preview_existing'

export interface ApartmentPlacementStateIdle {
  kind: 'idle'
}

export interface ApartmentPlacementStatePreviewNew {
  kind: 'preview_new'
  itemDef: ApartmentPlacementItemDef
  ownedCountRef: Ref<number>
}

export interface ApartmentPlacementStatePreviewExisting {
  kind: 'preview_existing'
  objectId: string
  /** Mesh hidden locally while previewing; restored on cancel/commit error. */
  sourceMesh: THREE.Mesh
  /** Physics body unregistered for this id during preview. */
  restorePhysicsOnExit: boolean
}

export type ApartmentPlacementState =
  | ApartmentPlacementStateIdle
  | ApartmentPlacementStatePreviewNew
  | ApartmentPlacementStatePreviewExisting

export interface ApartmentPlacementInit {
  getScene: () => THREE.Scene | undefined
  getCamera: () => THREE.PerspectiveCamera | undefined
  getRenderer: () => THREE.WebGLRenderer | undefined
  getColyseusRoom: () => Room | null
  getApartmentObjectMesh: (objectId: string) => THREE.Mesh | undefined
  currentRoomLabel: Ref<'city' | 'apartment'>
  pointerLocked: Ref<boolean>
  getApartmentInventoryOpen: () => boolean
  persistApartmentTransformForMesh: (mesh: THREE.Mesh, force: boolean) => void
  refreshApartmentInventory: () => void
}

export function useApartmentPlacement(ctx: ApartmentPlacementInit) {
  const currentState = shallowRef<ApartmentPlacementState>({ kind: 'idle' })
  const currentValidity = ref<boolean>(true)
  const hudHints = ref<string[]>([])
  const crosshairTint = ref<'neutral' | 'valid' | 'invalid'>('neutral')

  const placementSceneRef = shallowRef<THREE.Scene | null>(null)
  const apartmentEnvGroup = shallowRef<THREE.Group | null>(null)

  let world: World | null = null
  let initPromise: Promise<void> | null = null
  const propBodies = new Map<string, RAPIER.RigidBody>()
  const propMeshById = new Map<string, THREE.Mesh>()
  const pendingMeshes: THREE.Mesh[] = []

  const raycaster = new THREE.Raycaster()
  const ndcCenter = new THREE.Vector2(0, 0)

  const ghostParent = new THREE.Group()
  ghostParent.name = 'ApartmentPlacementGhost'

  let ghostContent: THREE.Object3D | null = null
  const ghostMaterials: THREE.MeshStandardMaterial[] = []

  const smoothPos = new THREE.Vector3()
  const smoothQuat = new THREE.Quaternion()
  const targetPos = new THREE.Vector3()
  const targetQuat = new THREE.Quaternion()
  const tmpVec = new THREE.Vector3()
  const tmpQuat = new THREE.Quaternion()
  const downAxis = new THREE.Vector3(0, -1, 0)
  const alignQuat = new THREE.Quaternion()
  const yawQuat = new THREE.Quaternion()

  let userYawTarget = 0
  let userYawSmoothed = 0

  let rawValidity = true
  let validityBlend = 1
  let colorLerpRemaining = 0
  let colorLerpFrom = 1
  let colorLerpTo = 1

  let denyShakeMsRemaining = 0
  let denyShakeIntensity = 0
  let denyFlashEmissiveBoost = 0

  let placementTime = 0

  let watchStopOwned: WatchStopHandle | null = null

  /** Rapier query: exclude apartment props we're ray-hitting (stacking support surface). */
  const hitPropsToExclude = new Set<string>()

  const ghostLoader = new GLTFLoader()
  const ghostTemplateCache = new Map<string, THREE.Object3D>()

  const isPreviewing = computed(
    () => currentState.value.kind === 'preview_new' || currentState.value.kind === 'preview_existing',
  )

  function tearDownOwnedWatch(): void {
    if (watchStopOwned) {
      watchStopOwned()
      watchStopOwned = null
    }
  }

  function clearGhostMaterialsList(): void {
    ghostMaterials.length = 0
  }

  function collectGhostMaterials(root: THREE.Object3D): void {
    root.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshStandardMaterial) {
        ghostMaterials.push(o.material)
      }
    })
  }

  function removeGhostContent(): void {
    if (!ghostContent) return
    ghostParent.remove(ghostContent)
    disposeObject3D(ghostContent)
    ghostContent = null
    clearGhostMaterialsList()
  }

  function applyGhostPalette(
    color: number,
    emissive: number,
    emissiveIntensity: number,
    opacity: number,
    pulse: number,
  ): void {
    const op = Math.max(0.08, Math.min(1, opacity + pulse))
    for (const m of ghostMaterials) {
      m.color.setHex(color)
      m.emissive.setHex(emissive)
      m.emissiveIntensity = emissiveIntensity + denyFlashEmissiveBoost
      m.opacity = op
      m.transparent = true
      m.depthWrite = false
      m.needsUpdate = true
    }
  }

  function lerpColorChannel(a: number, b: number, t: number): number {
    return Math.round(a + (b - a) * t)
  }

  function lerpValidityColors(dt: number): void {
    if (colorLerpRemaining > 0) {
      colorLerpRemaining = Math.max(0, colorLerpRemaining - dt)
      const span = VALIDITY_COLOR_BLEND_MS / 1000
      const t = span > 0 ? 1 - colorLerpRemaining / span : 1
      validityBlend = THREE.MathUtils.lerp(colorLerpFrom, colorLerpTo, t)
    } else {
      validityBlend = colorLerpTo
    }
    const r = lerpColorChannel((INVALID_COLOR >> 16) & 255, (VALID_COLOR >> 16) & 255, validityBlend)
    const gChan = lerpColorChannel((INVALID_COLOR >> 8) & 255, (VALID_COLOR >> 8) & 255, validityBlend)
    const bChan = lerpColorChannel(INVALID_COLOR & 255, VALID_COLOR & 255, validityBlend)
    const er = lerpColorChannel((INVALID_EMISSIVE >> 16) & 255, (VALID_EMISSIVE >> 16) & 255, validityBlend)
    const eg = lerpColorChannel((INVALID_EMISSIVE >> 8) & 255, (VALID_EMISSIVE >> 8) & 255, validityBlend)
    const eb = lerpColorChannel(INVALID_EMISSIVE & 255, VALID_EMISSIVE & 255, validityBlend)
    const c = (r << 16) | (gChan << 8) | bChan
    const em = (er << 16) | (eg << 8) | eb
    const eInt = INVALID_EMISSIVE_INT + (VALID_EMISSIVE_INT - INVALID_EMISSIVE_INT) * validityBlend
    const opBase = INVALID_OPACITY_BASE + (VALID_OPACITY_BASE - INVALID_OPACITY_BASE) * validityBlend
    const pulse = Math.sin(placementTime * 3) * 0.05
    applyGhostPalette(c, em, eInt, opBase, pulse)
  }

  function setRawValidity(next: boolean): void {
    if (next === rawValidity) return
    rawValidity = next
    colorLerpFrom = validityBlend
    colorLerpTo = next ? 1 : 0
    colorLerpRemaining = VALIDITY_COLOR_BLEND_MS / 1000
    currentValidity.value = next
    crosshairTint.value = next ? 'valid' : 'invalid'
  }

  function triggerDenyFeedback(): void {
    denyShakeMsRemaining = DENY_SHAKE_MS
    denyShakeIntensity = 0.06
    denyFlashEmissiveBoost = 0.85
  }

  async function ensureWorld(): Promise<void> {
    if (ctx.currentRoomLabel.value !== 'apartment') return
    if (world) return
    if (!initPromise) {
      initPromise = (async () => {
        await RAPIER.init()
        const w = new RAPIER.World(new RAPIER.Vector3(0, 0, 0))
        addApartmentStaticColliders(w)
        world = w
        const pending = [...pendingMeshes]
        pendingMeshes.length = 0
        for (const m of pending) {
          internalRegisterProp(m)
        }
      })()
    }
    await initPromise
  }

  function syncPropBodyFromMesh(mesh: THREE.Mesh): void {
    const id = typeof mesh.userData.apartmentObjectId === 'string' ? mesh.userData.apartmentObjectId : ''
    if (!id || !world) return
    const body = propBodies.get(id)
    if (!body || !body.isValid()) return
    const p = mesh.position
    const q = mesh.quaternion
    body.setTranslation(new RAPIER.Vector3(p.x, p.y, p.z), true)
    body.setRotation(new RAPIER.Quaternion(q.x, q.y, q.z, q.w), true)
  }

  function internalRegisterProp(mesh: THREE.Mesh): void {
    const objectId = typeof mesh.userData.apartmentObjectId === 'string' ? mesh.userData.apartmentObjectId : ''
    if (!objectId) return
    if (!world) {
      pendingMeshes.push(mesh)
      return
    }
    internalUnregisterProp(objectId)
    const { halfExtents, centerLocal } = computePlacementLocalAabb(mesh)
    const pos = mesh.position
    const quat = mesh.quaternion
    const desc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation(new RAPIER.Quaternion(quat.x, quat.y, quat.z, quat.w))
    const body = world.createRigidBody(desc)
    const pud: PropPhysicsUserData = { kind: 'apartmentPlacementProp', objectId }
    body.userData = pud as unknown
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
      .setTranslation(centerLocal.x, centerLocal.y, centerLocal.z)
      .setDensity(0)
    world.createCollider(colliderDesc, body)
    propBodies.set(objectId, body)
    propMeshById.set(objectId, mesh)
  }

  function internalUnregisterProp(objectId: string): void {
    pendingMeshes.splice(
      0,
      pendingMeshes.length,
      ...pendingMeshes.filter(
        (m) => (typeof m.userData.apartmentObjectId === 'string' ? m.userData.apartmentObjectId : '') !== objectId,
      ),
    )
    propMeshById.delete(objectId)
    const body = propBodies.get(objectId)
    if (body && body.isValid() && world) {
      world.removeRigidBody(body)
    }
    propBodies.delete(objectId)
  }

  function registerApartmentEnvironment(build: ApartmentEnvironmentBuildResult): void {
    apartmentEnvGroup.value = build.group
    void ensureWorld()
  }

  function registerApartmentProp(_objectId: string, mesh: THREE.Mesh, _modelGlbBox?: THREE.Box3): void {
    void _objectId
    void _modelGlbBox
    if (ctx.currentRoomLabel.value !== 'apartment') return
    void ensureWorld().then(() => internalRegisterProp(mesh))
  }

  function unregisterApartmentProp(objectId: string): void {
    if (ctx.currentRoomLabel.value !== 'apartment') {
      internalUnregisterProp(objectId)
      return
    }
    void ensureWorld().then(() => internalUnregisterProp(objectId))
  }

  function detachGhostFromScene(): void {
    const sc = placementSceneRef.value
    if (sc && ghostParent.parent === sc) {
      sc.remove(ghostParent)
    }
  }

  function disposePhysicsWorld(): void {
    tearDownOwnedWatch()
    for (const body of propBodies.values()) {
      if (world && body.isValid()) {
        world.removeRigidBody(body)
      }
    }
    propBodies.clear()
    propMeshById.clear()
    pendingMeshes.length = 0
    if (world) {
      world.free()
      world = null
    }
    initPromise = null
  }

  function resetIdleUi(): void {
    hudHints.value = []
    crosshairTint.value = 'neutral'
    currentValidity.value = true
    rawValidity = true
    validityBlend = 1
    colorLerpFrom = 1
    colorLerpTo = 1
    colorLerpRemaining = 0
    denyShakeMsRemaining = 0
    denyFlashEmissiveBoost = 0
    userYawTarget = 0
    userYawSmoothed = 0
  }

  function restorePreviewExistingPhysics(state: ApartmentPlacementStatePreviewExisting): void {
    if (!state.restorePhysicsOnExit) return
    void ensureWorld().then(() => internalRegisterProp(state.sourceMesh))
  }

  function cancelPreview(): void {
    const st = currentState.value
    if (st.kind === 'preview_existing') {
      st.sourceMesh.visible = true
      restorePreviewExistingPhysics(st)
    }
    tearDownOwnedWatch()
    removeGhostContent()
    detachGhostFromScene()
    currentState.value = { kind: 'idle' }
    resetIdleUi()
  }

  function onApartmentActionError(): void {
    const st = currentState.value
    if (st.kind === 'preview_new') {
      cancelPreview()
      return
    }
    if (st.kind !== 'preview_existing') return
    st.sourceMesh.visible = true
    restorePreviewExistingPhysics(st)
    tearDownOwnedWatch()
    removeGhostContent()
    detachGhostFromScene()
    currentState.value = { kind: 'idle' }
    resetIdleUi()
  }

  async function loadGhostTemplate(url: string): Promise<THREE.Object3D | null> {
    const cached = ghostTemplateCache.get(url)
    if (cached) return cached.clone(true)
    try {
      const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => {
        ghostLoader.load(url, resolve, undefined, reject)
      })
      ghostTemplateCache.set(url, gltf.scene)
      return gltf.scene.clone(true)
    } catch {
      return null
    }
  }

  function makeGhostMaterial(colorHex: string): THREE.MeshStandardMaterial {
    const col = new THREE.Color(colorHex)
    const mat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: VALID_EMISSIVE_INT,
      transparent: true,
      opacity: VALID_OPACITY_BASE,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    })
    return mat
  }

  function forceAllMaterialsToGhost(root: THREE.Object3D, colorHex: string): void {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const ghostMat = makeGhostMaterial(colorHex)
      o.material = ghostMat
      o.renderOrder = GHOST_RENDER_ORDER
      o.castShadow = false
      o.receiveShadow = false
    })
  }

  function buildPlaceholderCubeGhost(itemDef: ApartmentPlacementItemDef): void {
    removeGhostContent()
    const colorHex =
      typeof itemDef.defaultColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(itemDef.defaultColor)
        ? itemDef.defaultColor
        : '#8B7AA8'
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mat = makeGhostMaterial(colorHex)
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(0, 0, 0)
    mesh.renderOrder = GHOST_RENDER_ORDER
    const placeholderUd = mesh.userData as { isApartmentPlacementPlaceholder?: boolean }
    placeholderUd.isApartmentPlacementPlaceholder = true
    ghostContent = mesh
    ghostParent.add(mesh)
    collectGhostMaterials(mesh)
  }

  async function tryUpgradeGhostToGlb(itemDef: ApartmentPlacementItemDef): Promise<void> {
    const modelUrl =
      typeof itemDef.modelGlb === 'string' && itemDef.modelGlb.trim().length > 0 ? itemDef.modelGlb.trim() : null
    if (!modelUrl) return
    const colorHex =
      typeof itemDef.defaultColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(itemDef.defaultColor)
        ? itemDef.defaultColor
        : '#8B7AA8'
    const stateBeforeLoad = currentState.value
    const stateKindBefore = stateBeforeLoad.kind
    const objectKeyBefore =
      stateKindBefore === 'preview_new'
        ? stateBeforeLoad.itemDef.objectKey
        : stateKindBefore === 'preview_existing'
          ? itemDef.objectKey
          : ''
    const tpl = await loadGhostTemplate(modelUrl)
    if (!tpl) return
    const stateAtLoad = currentState.value
    if (stateAtLoad.kind === 'idle') return
    if (stateAtLoad.kind !== stateKindBefore) return
    if (stateAtLoad.kind === 'preview_new' && stateAtLoad.itemDef.objectKey !== objectKeyBefore) return
    removeGhostContent()
    const root = new THREE.Group()
    forceAllMaterialsToGhost(tpl, colorHex)
    const vud = tpl.userData as { isApartmentVisual?: boolean }
    vud.isApartmentVisual = true
    tpl.position.set(0, -0.5, 0)
    root.add(tpl)
    ghostContent = root
    ghostParent.add(root)
    collectGhostMaterials(root)
  }

  function buildGhostFromMesh(source: THREE.Mesh): void {
    const itemDef: ApartmentPlacementItemDef = {
      objectKey:
        typeof source.userData.apartmentObjectKey === 'string'
          ? (source.userData.apartmentObjectKey as string)
          : 'unknown',
      modelGlb:
        typeof source.userData.apartmentObjectModelGlb === 'string'
          ? (source.userData.apartmentObjectModelGlb as string)
          : undefined,
      defaultColor: '#8B7AA8',
      variant: 'default',
    }
    buildPlaceholderCubeGhost(itemDef)
    void tryUpgradeGhostToGlb(itemDef)
  }

  function startPreviewNew(itemDef: ApartmentPlacementItemDef, ownedCountRef: Ref<number>): void {
    if (ctx.currentRoomLabel.value !== 'apartment') return
    cancelPreview()
    if (ownedCountRef.value <= 0) return
    tearDownOwnedWatch()
    watchStopOwned = watch(
      ownedCountRef,
      (q) => {
        if (currentState.value.kind === 'preview_new' && q <= 0) {
          cancelPreview()
        }
      },
      { immediate: false },
    )
    currentState.value = { kind: 'preview_new', itemDef, ownedCountRef }
    userYawTarget = 0
    userYawSmoothed = 0
    hudHints.value = ['LMB place · RMB cancel · R rotate · Shift+R reverse · Esc / E cancel']
    crosshairTint.value = 'valid'
    const sc = ctx.getScene()
    if (sc) {
      placementSceneRef.value = sc
      sc.add(ghostParent)
    }
    const cam = ctx.getCamera()
    if (cam) {
      cam.getWorldPosition(smoothPos)
      const forward = cam.getWorldDirection(tmpVec)
      smoothPos.addScaledVector(forward, 2)
      smoothQuat.copy(cam.quaternion)
      ghostParent.position.copy(smoothPos)
      ghostParent.quaternion.copy(smoothQuat)
    }
    buildPlaceholderCubeGhost(itemDef)
    void ensureWorld()
    void tryUpgradeGhostToGlb(itemDef)
  }

  function startPreviewExisting(objectId: string, sourceMesh: THREE.Mesh): void {
    if (ctx.currentRoomLabel.value !== 'apartment') return
    cancelPreview()
    void ensureWorld().then(() => {
      internalUnregisterProp(objectId)
      sourceMesh.visible = false
      currentState.value = {
        kind: 'preview_existing',
        objectId,
        sourceMesh,
        restorePhysicsOnExit: true,
      }
      userYawTarget = new THREE.Euler().setFromQuaternion(sourceMesh.quaternion, 'YXZ').y
      userYawSmoothed = userYawTarget
      buildGhostFromMesh(sourceMesh)
      hudHints.value = ['LMB commit move · RMB cancel · R rotate · Shift+R reverse · Esc / E cancel']
      crosshairTint.value = 'valid'
      const sc = ctx.getScene()
      if (sc) {
        placementSceneRef.value = sc
        sc.add(ghostParent)
      }
      const cam = ctx.getCamera()
      if (cam) {
        cam.getWorldPosition(smoothPos)
        const forward = cam.getWorldDirection(tmpVec)
        smoothPos.addScaledVector(forward, 2)
        smoothQuat.copy(cam.quaternion)
        ghostParent.position.copy(smoothPos)
        ghostParent.quaternion.copy(smoothQuat)
      }
    })
  }

  /** When the server removes an object while we are holding it for reposition. */
  function notifyPropRemovedFromWorld(objectId: string): void {
    const st = currentState.value
    if (st.kind === 'preview_existing' && st.objectId === objectId) {
      cancelPreview()
    }
  }

  function connectScene(_?: {
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    colyseusRoom: unknown
  }): void {
    void _
    placementSceneRef.value = ctx.getScene() ?? null
  }

  function setPlayerInsideApartment(inside: boolean): void {
    if (!inside) {
      cancelPreview()
      disposePhysicsWorld()
      apartmentEnvGroup.value = null
      placementSceneRef.value = null
    }
  }

  function raycastPlacementTargets(camera: THREE.PerspectiveCamera): THREE.Intersection[] {
    const env = apartmentEnvGroup.value
    const sc = ctx.getScene()
    if (!env || !sc) return []
    const objs: THREE.Object3D[] = [env]
    for (const c of sc.children) {
      if (!(c instanceof THREE.Mesh)) continue
      const id = typeof c.userData.apartmentObjectId === 'string' ? c.userData.apartmentObjectId : ''
      if (!id) continue
      if (!c.visible) continue
      const st = currentState.value
      if (st.kind === 'preview_existing' && st.objectId === id) continue
      objs.push(c)
    }
    raycaster.setFromCamera(ndcCenter, camera)
    raycaster.far = RAYCAST_MAX
    return raycaster.intersectObjects(objs, true)
  }

  function computeTargetFromHit(hit: THREE.Intersection): { pos: THREE.Vector3; quat: THREE.Quaternion } {
    const n = hit.face?.normal
      ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld).normalize()
      : new THREE.Vector3(0, 1, 0)
    const hitPoint = hit.point.clone()
    const negN = tmpVec.copy(n).multiplyScalar(-1).normalize()
    alignQuat.setFromUnitVectors(downAxis, negN)
    yawQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), userYawSmoothed)
    const quat = tmpQuat.copy(alignQuat).multiply(yawQuat)
    ghostParent.position.copy(hitPoint)
    ghostParent.quaternion.copy(quat)
    ghostParent.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(ghostParent)
    const corners = [
      new THREE.Vector3(box.min.x, box.min.y, box.min.z),
      new THREE.Vector3(box.max.x, box.min.y, box.min.z),
      new THREE.Vector3(box.min.x, box.max.y, box.min.z),
      new THREE.Vector3(box.max.x, box.max.y, box.min.z),
      new THREE.Vector3(box.min.x, box.min.y, box.max.z),
      new THREE.Vector3(box.max.x, box.min.y, box.max.z),
      new THREE.Vector3(box.min.x, box.max.y, box.max.z),
      new THREE.Vector3(box.max.x, box.max.y, box.max.z),
    ]
    let minAlong = Infinity
    for (const p of corners) {
      const along = p.clone().sub(hitPoint).dot(n)
      minAlong = Math.min(minAlong, along)
    }
    const outPos = hitPoint.clone()
    if (Number.isFinite(minAlong)) {
      outPos.addScaledVector(n, -minAlong + 0.002)
    }
    return { pos: outPos, quat: quat.clone() }
  }

  function ghostIntersectsEnvironment(): boolean {
    if (!world || !ghostContent) return false
    ghostParent.updateMatrixWorld(true)
    const { halfExtents, centerLocal } = computePlacementLocalAabb(ghostParent)
    const centerWorld = centerLocal.clone().applyMatrix4(ghostParent.matrixWorld)
    const shapePos = new RAPIER.Vector3(centerWorld.x, centerWorld.y, centerWorld.z)
    const q = ghostParent.quaternion
    const shapeRot = new RAPIER.Quaternion(q.x, q.y, q.z, q.w)
    const shape = new RAPIER.Cuboid(halfExtents.x, halfExtents.y, halfExtents.z)

    const st = currentState.value
    const excludeId = st.kind === 'preview_existing' ? st.objectId : ''

    let hit = false
    world.propagateModifiedBodyPositionsToColliders()
    world.intersectionsWithShape(
      shapePos,
      shapeRot,
      shape,
      () => {
        hit = true
        return false
      },
      undefined,
      undefined,
      undefined,
      undefined,
      (collider: Collider) => filterGhostCollider(collider, excludeId),
    )
    return hit
  }

  /** `false` = skip collider (Rapier predicate). */
  function filterGhostCollider(collider: Collider, excludeObjectId: string): boolean {
    const parent = collider.parent()
    if (!parent) return true
    const ud = parent.userData as unknown
    if (isPropPhysicsUserData(ud)) {
      if (ud.objectId === excludeObjectId) return false
      if (hitPropsToExclude.has(ud.objectId)) return false
      return true
    }
    if (isStaticPhysicsUserData(ud) && ud.subkind === 'floor') {
      return false
    }
    return true
  }

  function tick(dt: number): void {
    placementTime += dt
    if (denyShakeMsRemaining > 0) {
      denyShakeMsRemaining = Math.max(0, denyShakeMsRemaining - dt * 1000)
      const t = denyShakeMsRemaining / DENY_SHAKE_MS
      denyShakeIntensity *= t > 0 ? t : 0
      if (denyShakeMsRemaining <= 0) {
        denyShakeIntensity = 0
        ghostParent.position.copy(smoothPos)
      }
    }
    if (denyFlashEmissiveBoost > 0) {
      denyFlashEmissiveBoost = Math.max(0, denyFlashEmissiveBoost - dt * 4)
    }

    if (ctx.currentRoomLabel.value === 'apartment' && world) {
      for (const [, mesh] of propMeshById) {
        const stSync = currentState.value
        const mid = typeof mesh.userData.apartmentObjectId === 'string' ? mesh.userData.apartmentObjectId : ''
        if (stSync.kind === 'preview_existing' && stSync.objectId === mid) continue
        if (!mesh.visible) continue
        syncPropBodyFromMesh(mesh)
      }
      world.propagateModifiedBodyPositionsToColliders()
    }

    const st = currentState.value
    if (st.kind === 'idle' || !ghostContent) {
      return
    }

    const cam = ctx.getCamera()
    if (!cam) return

    userYawSmoothed += (userYawTarget - userYawSmoothed) * (1 - Math.exp(-dt / ROT_TAU_S))

    const hits = raycastPlacementTargets(cam)
    hitPropsToExclude.clear()
    const firstHit = hits[0]
    if (firstHit) {
      let o: THREE.Object3D | null = firstHit.object
      while (o) {
        const pid = o.userData.apartmentObjectId
        if (typeof pid === 'string' && pid.length > 0) {
          hitPropsToExclude.add(pid)
          break
        }
        o = o.parent
      }
      const { pos, quat } = computeTargetFromHit(firstHit)
      targetPos.copy(pos)
      targetQuat.copy(quat)
    } else {
      const dir = cam.getWorldDirection(tmpVec).normalize()
      targetPos.copy(cam.getWorldPosition(tmpVec.clone())).addScaledVector(dir, 2.5)
      targetQuat.copy(cam.quaternion)
    }

    const posAlpha = expSmooth(POS_SMOOTH_PER_FRAME, dt)
    smoothPos.lerp(targetPos, posAlpha)
    const yawAlpha = expSmooth(YAW_SMOOTH_PER_FRAME, dt)
    smoothQuat.slerp(targetQuat, yawAlpha)

    ghostParent.position.copy(smoothPos)
    ghostParent.quaternion.copy(smoothQuat)

    if (denyShakeMsRemaining > 0 && denyShakeIntensity > 0) {
      const shake = Math.sin(placementTime * 40) * denyShakeIntensity
      ghostParent.translateX(shake)
    }

    const intersects = ghostIntersectsEnvironment()
    setRawValidity(!intersects)
    lerpValidityColors(dt)
  }

  function stepRotate(deltaRadians: number): void {
    const st = currentState.value
    if (st.kind === 'idle') return
    userYawTarget += deltaRadians
  }

  function tryCommitPreview(): void {
    const st = currentState.value
    if (st.kind === 'idle' || !ghostContent) return
    if (!currentValidity.value) {
      triggerDenyFeedback()
      return
    }
    const room = ctx.getColyseusRoom()
    if (!room || ctx.currentRoomLabel.value !== 'apartment') return

    if (st.kind === 'preview_new') {
      const def = st.itemDef
      const objectId = crypto.randomUUID()
      const yFloor = ghostParent.position.y - 0.5
      const euler = new THREE.Euler().setFromQuaternion(ghostParent.quaternion, 'XYZ')
      room.send('apartment_spawn_request', {
        objectId,
        objectKey: def.objectKey,
        variant: def.variant ?? 'default',
        color: def.defaultColor ?? '#8B7AA8',
        x: ghostParent.position.x,
        y: yFloor,
        z: ghostParent.position.z,
        rotX: euler.x,
        rotY: euler.y,
        rotZ: euler.z,
      })
      ctx.refreshApartmentInventory()
      cancelPreview()
      return
    }

    if (st.kind === 'preview_existing') {
      const mesh = st.sourceMesh
      mesh.position.copy(ghostParent.position)
      mesh.quaternion.copy(ghostParent.quaternion)
      mesh.visible = true
      tearDownOwnedWatch()
      removeGhostContent()
      detachGhostFromScene()
      currentState.value = { kind: 'idle' }
      resetIdleUi()
      ctx.persistApartmentTransformForMesh(mesh, true)
      void ensureWorld().then(() => internalRegisterProp(mesh))
    }
  }

  function tryPickIdle(objectId: string, mesh: THREE.Mesh): void {
    if (currentState.value.kind !== 'idle') return
    startPreviewExisting(objectId, mesh)
  }

  function onPointerDown(e: MouseEvent): void {
    if (ctx.currentRoomLabel.value !== 'apartment' || !ctx.pointerLocked.value) return
    if (ctx.getApartmentInventoryOpen()) return
    if (e.button === 2) {
      e.preventDefault()
      cancelPreview()
      return
    }
    if (e.button !== 0) return
    const st = currentState.value
    if (st.kind !== 'idle') {
      tryCommitPreview()
      return
    }
    const cam = ctx.getCamera()
    if (!cam) return
    const hits = raycastPlacementTargets(cam)
    if (hits.length === 0) return
    const topHit = hits[0]
    if (!topHit) return
    let o: THREE.Object3D | null = topHit.object
    while (o) {
      const idUnknown = o.userData.apartmentObjectId
      if (typeof idUnknown === 'string' && idUnknown.length > 0) {
        const mesh = ctx.getApartmentObjectMesh(idUnknown)
        if (mesh) {
          tryPickIdle(idUnknown, mesh)
        }
        return
      }
      o = o.parent
    }
  }

  function dispose(): void {
    cancelPreview()
    disposePhysicsWorld()
    apartmentEnvGroup.value = null
    placementSceneRef.value = null
  }

  return {
    currentState,
    currentValidity,
    hudHints,
    crosshairTint,
    isPreviewing,
    init: connectScene,
    setPlayerInsideApartment,
    registerApartmentEnvironment,
    registerApartmentProp,
    unregisterApartmentProp,
    startPreviewNew,
    startPreviewExisting,
    cancelPreview,
    onApartmentActionError,
    notifyPropRemovedFromWorld,
    tick,
    stepRotate,
    tryCommitPreview,
    tryPickIdle,
    dispose,
    onPointerDown,
  }
}
