<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import * as THREE from 'three'
import { Client as ColyseusClient, type Room } from '@colyseus/sdk'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import {
  appearanceIdsFromLoadout,
  bodyModelGlbFromLoadout,
  defaultCosmeticColors,
  emptyCosmeticLoadout,
  fetchCharacterCosmetics,
  SLOTS,
  type CharacterCosmeticsState,
  type CosmeticColors,
  DEFAULT_SLOT_COLORS,
} from '../api/characterCosmetics'
import { getStoredAuth, clearAuth } from '../api/auth'
import { createTintedCharacterFromUrl } from '../avatar/glbCharacter'
import {
  buildCompositeAvatar,
  buildFirstPersonHands,
  disposeObject3D,
} from '../avatar/compositeAvatar'

interface RemoteUserPayload {
  sessionId: string
  id: string
  pseudo: string
  color: number
  x: number
  y: number
  z: number
  zone: 'city' | 'apartment'
  apartmentOwnerId: number | null
  slotHexes?: Record<string, string>
  bodyModelGlb?: string | null
}

interface RoomInitPayload {
  me: RemoteUserPayload
  users: RemoteUserPayload[]
}

interface ApartmentInitPayload {
  ownerAccountId: number
  templateKey: string
  name: string
  objects: ApartmentObjectPayload[]
}

interface ApartmentObjectPayload {
  objectId: string
  objectKey: string
  variant: string | null
  color: string | null
  x: number
  y: number
  z: number
  rotX: number
  rotY: number
  rotZ: number
}

interface OtherUser {
  userId: string
  group: THREE.Group
  x: number
  y: number
  z: number
  zone: 'city' | 'apartment'
  apartmentOwnerId: number | null
  color: number
  bodyTintColors: CosmeticColors
  bodyModelGlb: string | null
}

interface PendingAppearanceUpdate {
  appearance: Record<string, number | null>
  slotHexes?: Record<string, string>
  bodyModelGlb?: string | null
}

interface TransformDragEvent {
  value: boolean
}

const router = useRouter()
const containerRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const roomMessage = ref<string | null>(null)
const currentRoomLabel = ref<'city' | 'apartment'>('city')
const apartmentObjectCount = ref<number>(0)
const apartmentObjectIds = ref<string[]>([])
const nearApartmentDoor = ref<boolean>(false)
const nearCityDoor = ref<boolean>(false)
const editorEnabled = ref<boolean>(false)
const transformMode = ref<'translate' | 'rotate'>('translate')
const switchingRoom = ref<boolean>(false)

const realtimeHttpUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000'

function toWsUrl(rawUrl: string): string {
  if (rawUrl.startsWith('https://')) return `wss://${rawUrl.slice('https://'.length)}`
  if (rawUrl.startsWith('http://')) return `ws://${rawUrl.slice('http://'.length)}`
  return rawUrl
}

function containerSize(): { w: number; h: number } {
  const el = containerRef.value
  if (el && el.clientWidth > 0 && el.clientHeight > 0) {
    return { w: el.clientWidth, h: el.clientHeight }
  }
  return { w: window.innerWidth, h: window.innerHeight }
}

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let roomEnvironment: THREE.Group | null = null
let fpHands: THREE.Group | null = null
let transformControls: TransformControls | null = null
let transformControlsHelper: THREE.Object3D | null = null
let colyseusClient: ColyseusClient | null = null
let gameRoom: Room | null = null
const apartmentObjects = new Map<string, THREE.Mesh>()
let persistTransformTimer: ReturnType<typeof setTimeout> | null = null
let lastTransformPersistAt = 0
let lastPersistedTestObject: ApartmentObjectPayload | null = null

const otherUsers = ref<Map<string, OtherUser>>(new Map())
const sessionByUserId = new Map<string, string>()
const pendingAppearanceUpdates = new Map<string, PendingAppearanceUpdate>()
const upsertTokenByUserId = new Map<string, number>()
const renderTokenBySessionId = new Map<string, number>()
const keys = { forward: false, back: false, left: false, right: false }
const pointerLocked = ref(false)
const velocity = new THREE.Vector3(0, 0, 0)
const direction = new THREE.Vector3(0, 0, -1)
const moveSpeed = 8
const myPosition = { x: 0, y: 1.6, z: 0 }
/** Fixed entry when joining an apartment instance (must match server sync via immediate `move`). */
const APARTMENT_SPAWN = { x: 0, y: 1.6, z: 4 }
/** Inner half-size of the apartment box (player clamp margin applied in updateMovement). */
const APARTMENT_HALF_EXTENT = 5
const APARTMENT_CLAMP_MARGIN = 0.35
const APARTMENT_DOOR_RADIUS = 1.4
const APARTMENT_DOOR_POS = { x: 0, z: APARTMENT_HALF_EXTENT - 0.45 }
const CITY_BUILDING_DOOR_RADIUS = 2.2
const CITY_BUILDING_DOOR_POS = { x: 0, z: 8 }
const APARTMENT_TEST_OBJECT_ID = 'apartment_test_cube_v1'
const TRANSFORM_PERSIST_THROTTLE_MS = 150
const TRANSFORM_EPSILON_POSITION = 0.01
const TRANSFORM_EPSILON_ROTATION = 0.01
let lastEmit = 0
const emitInterval = 50
let refreshMyAppearance: (() => void) | null = null

function nextRenderToken(sessionId: string): number {
  const next = (renderTokenBySessionId.get(sessionId) ?? 0) + 1
  renderTokenBySessionId.set(sessionId, next)
  return next
}

function hexStringToNumber(hex: string): number {
  return parseInt(hex.length === 7 ? hex.slice(1) : hex, 16)
}

function parseBodyTintColors(raw: Record<string, string> | null | undefined): CosmeticColors {
  const bodyHex =
    raw && typeof raw.body === 'string' && /^#[0-9A-Fa-f]{6}$/.test(raw.body) ? raw.body : DEFAULT_SLOT_COLORS.body
  const out = { ...DEFAULT_SLOT_COLORS }
  for (const s of SLOTS) out[s] = bodyHex
  return out
}

function parseBodyModelGlb(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim().length > 0 ? raw.trim() : null
}

function placeAvatar(group: THREE.Group, x: number, y: number, z: number) {
  group.position.set(x, y, z)
}

function isRemoteVisible(zone: 'city' | 'apartment', apartmentOwnerId: number | null): boolean {
  if (currentRoomLabel.value === 'city') return zone === 'city'
  return zone === 'apartment' && apartmentOwnerId === getStoredAuth()?.user.account_id
}

function removeSceneAvatarDuplicates(sessionId: string, userId: string) {
  const toRemove: THREE.Object3D[] = []
  for (const child of scene.children) {
    if (!(child instanceof THREE.Group)) continue
    const tag = child.userData as { isRemoteAvatar?: boolean; sessionId?: string; userId?: string }
    if (!tag.isRemoteAvatar) continue
    if (tag.sessionId === sessionId || tag.userId === userId) {
      toRemove.push(child)
    }
  }
  for (const obj of toRemove) {
    scene.remove(obj)
    disposeObject3D(obj)
  }
}

function removeOtherUsersByUserIdExcept(userId: string, keepSessionId: string) {
  for (const [sid, ou] of [...otherUsers.value.entries()]) {
    if (ou.userId !== userId || sid === keepSessionId) continue
    removeOtherUser(sid)
  }
}

function removeOtherUser(sessionId: string) {
  const entry = otherUsers.value.get(sessionId)
  if (!entry) return
  removeSceneAvatarDuplicates(sessionId, entry.userId)
  scene.remove(entry.group)
  disposeObject3D(entry.group)
  otherUsers.value.delete(sessionId)
  if (sessionByUserId.get(entry.userId) === sessionId) {
    sessionByUserId.delete(entry.userId)
  }
  pendingAppearanceUpdates.delete(sessionId)
  renderTokenBySessionId.delete(sessionId)
}

async function upsertOtherUser(sessionId: string, data: RemoteUserPayload) {
  if (!isRemoteVisible(data.zone, data.apartmentOwnerId)) {
    removeOtherUser(sessionId)
    return
  }
  const renderToken = nextRenderToken(sessionId)
  const token = (upsertTokenByUserId.get(data.id) ?? 0) + 1
  upsertTokenByUserId.set(data.id, token)

  removeOtherUsersByUserIdExcept(data.id, sessionId)

  const knownSessionId = sessionByUserId.get(data.id)
  if (knownSessionId && knownSessionId !== sessionId) {
    removeOtherUser(knownSessionId)
  }

  const bodyTintColors = parseBodyTintColors(data.slotHexes)
  const bodyModelGlb = parseBodyModelGlb(data.bodyModelGlb)
  const existing = otherUsers.value.get(sessionId)
  if (existing) {
    scene.remove(existing.group)
    disposeObject3D(existing.group)
    otherUsers.value.delete(sessionId)
    if (sessionByUserId.get(existing.userId) === sessionId) {
      sessionByUserId.delete(existing.userId)
    }
    pendingAppearanceUpdates.delete(sessionId)
  }
  const glb = await createTintedCharacterFromUrl(bodyModelGlb, bodyTintColors)
  const group = glb ?? buildCompositeAvatar(null, data.color)

  if (upsertTokenByUserId.get(data.id) !== token) {
    disposeObject3D(group)
    return
  }
  if (renderTokenBySessionId.get(sessionId) !== renderToken) {
    disposeObject3D(group)
    return
  }

  const latestSessionId = sessionByUserId.get(data.id)
  if (latestSessionId && latestSessionId !== sessionId) {
    removeOtherUser(latestSessionId)
  }
  removeOtherUsersByUserIdExcept(data.id, sessionId)
  removeSceneAvatarDuplicates(sessionId, data.id)
  group.userData.isRemoteAvatar = true
  group.userData.sessionId = sessionId
  group.userData.userId = data.id
  placeAvatar(group, data.x, data.y, data.z)
  scene.add(group)
  otherUsers.value.set(sessionId, {
    userId: data.id,
    group,
    x: data.x,
    y: data.y,
    z: data.z,
    zone: data.zone,
    apartmentOwnerId: data.apartmentOwnerId,
    color: data.color,
    bodyTintColors,
    bodyModelGlb,
  })
  sessionByUserId.set(data.id, sessionId)

  const pending = pendingAppearanceUpdates.get(sessionId)
  if (pending) {
    pendingAppearanceUpdates.delete(sessionId)
    void updateOtherAppearance(sessionId, pending.appearance, pending.slotHexes, pending.bodyModelGlb)
  }
}

async function updateOtherAppearance(
  sessionId: string,
  _appearance: Record<string, number | null>,
  slotHexes?: Record<string, string>,
  bodyModelGlb?: string | null,
) {
  const entry = otherUsers.value.get(sessionId)
  if (!entry) {
    pendingAppearanceUpdates.set(sessionId, { appearance: _appearance, slotHexes, bodyModelGlb })
    return
  }
  if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId)) {
    removeOtherUser(sessionId)
    return
  }
  const renderToken = nextRenderToken(sessionId)
  const bodyTintColors = parseBodyTintColors(slotHexes)
  const parsedBodyModelGlb = parseBodyModelGlb(bodyModelGlb)
  const glb = await createTintedCharacterFromUrl(parsedBodyModelGlb, bodyTintColors)
  const latestEntry = otherUsers.value.get(sessionId)
  const group = glb ?? buildCompositeAvatar(null, (latestEntry ?? entry).color)
  if (!latestEntry) {
    disposeObject3D(group)
    return
  }
  if (renderTokenBySessionId.get(sessionId) !== renderToken) {
    disposeObject3D(group)
    return
  }
  removeOtherUsersByUserIdExcept(latestEntry.userId, sessionId)
  removeSceneAvatarDuplicates(sessionId, latestEntry.userId)
  group.userData.isRemoteAvatar = true
  group.userData.sessionId = sessionId
  group.userData.userId = latestEntry.userId
  scene.remove(latestEntry.group)
  disposeObject3D(latestEntry.group)
  placeAvatar(group, latestEntry.x, latestEntry.y, latestEntry.z)
  scene.add(group)
  otherUsers.value.set(sessionId, {
    ...latestEntry,
    group,
    bodyTintColors,
    bodyModelGlb: parsedBodyModelGlb,
  })
}

function clearRemoteUsers() {
  for (const id of [...otherUsers.value.keys()]) {
    removeOtherUser(id)
  }
}

function clearApartmentObjects() {
  for (const mesh of apartmentObjects.values()) {
    scene.remove(mesh)
    disposeObject3D(mesh)
  }
  apartmentObjects.clear()
  apartmentObjectIds.value = []
  apartmentObjectCount.value = 0
  lastPersistedTestObject = null
}

function upsertApartmentObjectMesh(payload: ApartmentObjectPayload) {
  let mesh = apartmentObjects.get(payload.objectId)
  const colorHex = typeof payload.color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(payload.color)
    ? payload.color
    : '#8B7AA8'
  if (!mesh) {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshStandardMaterial({ color: colorHex })
    mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.userData.apartmentObjectId = payload.objectId
    scene.add(mesh)
    apartmentObjects.set(payload.objectId, mesh)
  }
  const mat = mesh.material
  if (mat instanceof THREE.MeshStandardMaterial) {
    mat.color = new THREE.Color(colorHex)
    mat.needsUpdate = true
  }
  mesh.position.set(payload.x, payload.y + 0.5, payload.z)
  mesh.rotation.set(payload.rotX, payload.rotY, payload.rotZ)
  if (!apartmentObjectIds.value.includes(payload.objectId)) {
    apartmentObjectIds.value.push(payload.objectId)
  }
  apartmentObjectCount.value = apartmentObjectIds.value.length
}

function removeApartmentObjectMesh(objectId: string) {
  const mesh = apartmentObjects.get(objectId)
  if (!mesh) return
  if (transformControls && transformControls.object === mesh) {
    transformControls.detach()
  }
  scene.remove(mesh)
  disposeObject3D(mesh)
  apartmentObjects.delete(objectId)
  apartmentObjectIds.value = apartmentObjectIds.value.filter((id) => id !== objectId)
  apartmentObjectCount.value = apartmentObjectIds.value.length
}

function apartmentPayloadFromMesh(objectId: string, mesh: THREE.Mesh): ApartmentObjectPayload {
  const mat = mesh.material
  const color =
    mat instanceof THREE.MeshStandardMaterial ? `#${mat.color.getHexString().toUpperCase()}` : '#8B7AA8'
  return {
    objectId,
    objectKey: 'furniture.test.cube',
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

function persistTestObject(force: boolean) {
  if (!gameRoom || currentRoomLabel.value !== 'apartment') return
  const mesh = apartmentObjects.get(APARTMENT_TEST_OBJECT_ID)
  if (!mesh) return
  const payload = apartmentPayloadFromMesh(APARTMENT_TEST_OBJECT_ID, mesh)
  if (!force && lastPersistedTestObject && sameTransform(payload, lastPersistedTestObject)) {
    return
  }
  gameRoom.send('decorate_upsert', payload)
  lastPersistedTestObject = payload
  lastTransformPersistAt = Date.now()
}

function schedulePersistTestObject(force = false) {
  if (!gameRoom || currentRoomLabel.value !== 'apartment') return
  if (force) {
    if (persistTransformTimer) {
      clearTimeout(persistTransformTimer)
      persistTransformTimer = null
    }
    persistTestObject(true)
    return
  }
  const elapsed = Date.now() - lastTransformPersistAt
  if (elapsed >= TRANSFORM_PERSIST_THROTTLE_MS) {
    persistTestObject(false)
    return
  }
  if (persistTransformTimer) return
  const remaining = TRANSFORM_PERSIST_THROTTLE_MS - elapsed
  persistTransformTimer = setTimeout(() => {
    persistTransformTimer = null
    persistTestObject(false)
  }, remaining)
}

function ensureApartmentTestObjectFromServer(objects: ApartmentObjectPayload[]) {
  clearApartmentObjects()
  lastPersistedTestObject = null
  for (const obj of objects) {
    upsertApartmentObjectMesh(obj)
    if (obj.objectId === APARTMENT_TEST_OBJECT_ID) {
      lastPersistedTestObject = obj
    }
  }
  if (!apartmentObjects.has(APARTMENT_TEST_OBJECT_ID)) {
    const starter: ApartmentObjectPayload = {
      objectId: APARTMENT_TEST_OBJECT_ID,
      objectKey: 'furniture.test.cube',
      variant: 'default',
      color: '#8B7AA8',
      x: 0,
      y: 0,
      z: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
    }
    upsertApartmentObjectMesh(starter)
    gameRoom?.send('decorate_upsert', starter)
  }
}

function setEditorEnabled(value: boolean) {
  editorEnabled.value = value
  if (transformControls) {
    transformControls.enabled = value && !pointerLocked.value
    if (transformControlsHelper) transformControlsHelper.visible = value
    if (!value) {
      transformControls.detach()
    }
  }
}

function applySceneAtmosphere(kind: 'city' | 'apartment') {
  if (kind === 'city') {
    scene.background = new THREE.Color(0x1a1a2e)
    scene.fog = new THREE.Fog(0x1a1a2e, 10, 50)
  } else {
    scene.background = new THREE.Color(0x3a342f)
    scene.fog = new THREE.Fog(0x3a342f, 4, 22)
  }
}

function buildCityEnvironment(): THREE.Group {
  const g = new THREE.Group()
  g.userData.isRoomEnvironment = true
  const floorGeo = new THREE.PlaneGeometry(50, 50)
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x16213e })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  g.add(floor)
  const grid = new THREE.GridHelper(50, 50, 0x0f3460, 0x0f3460)
  grid.position.y = 0.01
  g.add(grid)
  const buildingBody = new THREE.Mesh(
    new THREE.BoxGeometry(5, 4, 5),
    new THREE.MeshStandardMaterial({ color: 0x34455f })
  )
  buildingBody.position.set(CITY_BUILDING_DOOR_POS.x, 2, CITY_BUILDING_DOOR_POS.z + 2.6)
  buildingBody.castShadow = true
  buildingBody.receiveShadow = true
  g.add(buildingBody)
  const buildingDoor = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 2.2, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x2a1f1a })
  )
  buildingDoor.position.set(CITY_BUILDING_DOOR_POS.x, 1.1, CITY_BUILDING_DOOR_POS.z)
  buildingDoor.castShadow = true
  buildingDoor.receiveShadow = true
  g.add(buildingDoor)
  return g
}

function buildApartmentEnvironment(): THREE.Group {
  const g = new THREE.Group()
  g.userData.isRoomEnvironment = true
  const w = APARTMENT_HALF_EXTENT * 2
  const h = 3
  const t = 0.08
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x6b5344 })
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc4b8a8 })
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x9a8f82 })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, t, w), floorMat)
  floor.position.y = -t / 2
  floor.receiveShadow = true
  g.add(floor)
  const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w, t, w), ceilMat)
  ceiling.position.y = h + t / 2
  g.add(ceiling)
  const wallN = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), wallMat)
  wallN.position.set(0, h / 2, -APARTMENT_HALF_EXTENT)
  const wallS = new THREE.Mesh(new THREE.BoxGeometry(w, h, t), wallMat)
  wallS.position.set(0, h / 2, APARTMENT_HALF_EXTENT)
  const wallW = new THREE.Mesh(new THREE.BoxGeometry(t, h, w), wallMat)
  wallW.position.set(-APARTMENT_HALF_EXTENT, h / 2, 0)
  const wallE = new THREE.Mesh(new THREE.BoxGeometry(t, h, w), wallMat)
  wallE.position.set(APARTMENT_HALF_EXTENT, h / 2, 0)
  for (const m of [wallN, wallS, wallW, wallE]) {
    m.castShadow = true
    m.receiveShadow = true
    g.add(m)
  }
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x3a2f2a })
  )
  door.position.set(APARTMENT_DOOR_POS.x, 1.1, APARTMENT_DOOR_POS.z)
  door.userData.isApartmentDoor = true
  g.add(door)
  return g
}

function setRoomEnvironment(kind: 'city' | 'apartment') {
  if (roomEnvironment) {
    scene.remove(roomEnvironment)
    disposeObject3D(roomEnvironment)
    roomEnvironment = null
  }
  applySceneAtmosphere(kind)
  roomEnvironment = kind === 'city' ? buildCityEnvironment() : buildApartmentEnvironment()
  scene.add(roomEnvironment)
  if (kind === 'city') {
    nearApartmentDoor.value = false
    setEditorEnabled(false)
    clearApartmentObjects()
  } else {
    nearCityDoor.value = false
  }
}

function clampMyPositionToApartment() {
  const lim = APARTMENT_HALF_EXTENT - APARTMENT_CLAMP_MARGIN
  myPosition.x = Math.max(-lim, Math.min(lim, myPosition.x))
  myPosition.z = Math.max(-lim, Math.min(lim, myPosition.z))
}

function initThree(accentColor: number) {
  if (!canvasRef.value) return
  scene = new THREE.Scene()
  applySceneAtmosphere('city')

  const { w, h } = containerSize()
  const aspect = w / h
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000)
  camera.position.set(0, 1.6, 0)

  renderer = new THREE.WebGLRenderer({ canvas: canvasRef.value, antialias: true })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const ambient = new THREE.AmbientLight(0x404060, 0.6)
  scene.add(ambient)
  const dir = new THREE.DirectionalLight(0xffffff, 0.8)
  dir.position.set(10, 20, 10)
  dir.castShadow = true
  dir.shadow.mapSize.set(1024, 1024)
  scene.add(dir)

  setRoomEnvironment('city')

  fpHands = buildFirstPersonHands(accentColor)
  fpHands.visible = false
  camera.add(fpHands)

  transformControls = new TransformControls(camera, renderer.domElement)
  transformControls.setMode('translate')
  transformControlsHelper = transformControls.getHelper()
  transformControlsHelper.visible = false
  transformControls.addEventListener('dragging-changed', (event) => {
    const drag = event as unknown as TransformDragEvent
    if (drag.value && document.pointerLockElement) {
      document.exitPointerLock()
    }
    if (!drag.value) {
      schedulePersistTestObject(true)
    }
  })
  transformControls.addEventListener('objectChange', () => {
    if (currentRoomLabel.value !== 'apartment') return
    schedulePersistTestObject()
  })
  scene.add(transformControlsHelper)
}

function bindRoomEvents(room: Room) {
  room.onMessage('init', (payload: RoomInitPayload) => {
    clearRemoteUsers()
    clearApartmentObjects()
    roomMessage.value = null
    currentRoomLabel.value = payload.me.zone
    setRoomEnvironment(payload.me.zone)
    myPosition.x = payload.me.x
    myPosition.y = payload.me.y
    myPosition.z = payload.me.z
    camera.position.set(payload.me.x, payload.me.y, payload.me.z)
    setEditorEnabled(false)
    if (transformControlsHelper) transformControlsHelper.visible = false
    payload.users.forEach((u) => {
      if (u.sessionId === room.sessionId) return
      void upsertOtherUser(u.sessionId, u)
    })
  })

  room.onMessage('user_joined', (data: RemoteUserPayload) => {
    if (data.sessionId === room.sessionId) return
    void upsertOtherUser(data.sessionId, data)
  })

  room.onMessage('user_moved', (data: { sessionId: string; x: number; y: number; z: number }) => {
    const entry = otherUsers.value.get(data.sessionId)
    if (!entry) return
    if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId)) {
      removeOtherUser(data.sessionId)
      return
    }
    entry.x = data.x
    entry.y = data.y
    entry.z = data.z
    entry.group.position.set(data.x, data.y, data.z)
  })

  room.onMessage(
    'appearance_updated',
    (data: {
      sessionId: string
      appearance: Record<string, number | null>
      slotHexes?: Record<string, string>
      bodyModelGlb?: string | null
    }) => {
      if (data.sessionId === room.sessionId) return
      void updateOtherAppearance(data.sessionId, data.appearance, data.slotHexes, data.bodyModelGlb)
    },
  )

  room.onMessage('user_left', (data: { sessionId: string }) => {
    removeOtherUser(data.sessionId)
  })

  room.onMessage('user_zone_changed', (data: {
    sessionId: string
    zone: 'city' | 'apartment'
    apartmentOwnerId: number | null
    x: number
    y: number
    z: number
  }) => {
    if (data.sessionId === room.sessionId) {
      currentRoomLabel.value = data.zone
      setRoomEnvironment(data.zone)
      myPosition.x = data.x
      myPosition.y = data.y
      myPosition.z = data.z
      camera.position.set(data.x, data.y, data.z)
      for (const [sid, entry] of [...otherUsers.value.entries()]) {
        if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId)) {
          removeOtherUser(sid)
        }
      }
      if (data.zone === 'city') {
        setEditorEnabled(false)
        if (transformControlsHelper) transformControlsHelper.visible = false
        clearApartmentObjects()
      }
      return
    }
    const entry = otherUsers.value.get(data.sessionId)
    if (!entry) return
    entry.zone = data.zone
    entry.apartmentOwnerId = data.apartmentOwnerId
    entry.x = data.x
    entry.y = data.y
    entry.z = data.z
    entry.group.position.set(data.x, data.y, data.z)
    if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId)) {
      removeOtherUser(data.sessionId)
    }
  })

  room.onMessage('apartment_init', (payload: ApartmentInitPayload) => {
    currentRoomLabel.value = 'apartment'
    setRoomEnvironment('apartment')
    myPosition.x = APARTMENT_SPAWN.x
    myPosition.y = APARTMENT_SPAWN.y
    myPosition.z = APARTMENT_SPAWN.z
    camera.position.set(APARTMENT_SPAWN.x, APARTMENT_SPAWN.y, APARTMENT_SPAWN.z)
    for (const [sid, entry] of [...otherUsers.value.entries()]) {
      if (!isRemoteVisible(entry.zone, entry.apartmentOwnerId)) {
        removeOtherUser(sid)
      }
    }
    ensureApartmentTestObjectFromServer(payload.objects)
    const testMesh = apartmentObjects.get(APARTMENT_TEST_OBJECT_ID)
    if (transformControls && testMesh) {
      transformControls.attach(testMesh)
      if (transformControlsHelper) transformControlsHelper.visible = editorEnabled.value
    }
  })

  room.onMessage('apartment_object_upserted', (data: ApartmentObjectPayload) => {
    upsertApartmentObjectMesh(data)
    if (data.objectId === APARTMENT_TEST_OBJECT_ID) {
      lastPersistedTestObject = data
    }
    if (data.objectId === APARTMENT_TEST_OBJECT_ID && transformControls && !transformControls.object) {
      const mesh = apartmentObjects.get(APARTMENT_TEST_OBJECT_ID)
      if (mesh) transformControls.attach(mesh)
    }
  })

  room.onMessage('apartment_object_removed', (data: { objectId: string }) => {
    removeApartmentObjectMesh(data.objectId)
  })

  room.onLeave(() => {
    if (switchingRoom.value) return
    roomMessage.value = 'Disconnected from realtime room.'
  })
}

async function connectRealtime(state: CharacterCosmeticsState) {
  const auth = getStoredAuth()
  if (!auth) {
    router.push({ name: 'landing' })
    return
  }

  const appearance = appearanceIdsFromLoadout(state.slots)
  const roomOptions: Record<string, unknown> = {
    token: auth.token,
    userId: auth.user.account_id,
    pseudo: auth.user.display_name || auth.user.username,
    appearance,
    slotHexes: { body: state.colors.body },
    bodyModelGlb: bodyModelGlbFromLoadout(state.slots),
  }

  if (!colyseusClient) {
    colyseusClient = new ColyseusClient(toWsUrl(realtimeHttpUrl))
  }

  switchingRoom.value = true
  try {
    if (gameRoom) {
      await gameRoom.leave()
      gameRoom = null
    }
    clearRemoteUsers()
    setEditorEnabled(false)
    lastPersistedTestObject = null
    lastTransformPersistAt = 0
    if (transformControls) {
      if (transformControlsHelper) transformControlsHelper.visible = false
      transformControls.detach()
    }
    currentRoomLabel.value = 'city'
    const nextRoom: Room = await colyseusClient.joinOrCreate('city', roomOptions)
    setRoomEnvironment('city')
    gameRoom = nextRoom
    bindRoomEvents(nextRoom)
  } catch (err) {
    const wsUrl = toWsUrl(realtimeHttpUrl)
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[realtime] Colyseus join failed', {
      room: 'city',
      wsUrl,
      message: errMsg,
      err,
    })
    const devHint = import.meta.env.DEV && errMsg.length > 0 ? ` (${errMsg})` : ''
    roomMessage.value = `Could not connect to city instance.${devHint}`
  } finally {
    switchingRoom.value = false
  }

  const refreshAppearanceFromApi = async () => {
    try {
      const latest = await fetchCharacterCosmetics()
      gameRoom?.send('appearance', {
        slots: { body: appearanceIdsFromLoadout(latest.slots).body },
        slotHexes: { body: latest.colors.body },
        bodyModelGlb: bodyModelGlbFromLoadout(latest.slots),
      })
    } catch {
      // keep previous values if refresh fails
    }
  }
  refreshMyAppearance = () => {
    void refreshAppearanceFromApi()
  }
}

async function enterMyApartment() {
  const auth = getStoredAuth()
  if (!auth || !gameRoom) return
  if (document.pointerLockElement) {
    document.exitPointerLock()
  }
  gameRoom.send('enter_apartment', {
    ownerAccountId: auth.user.account_id,
    templateKey: 'starter_loft'
  })
}

async function backToCity() {
  if (!gameRoom) return
  if (document.pointerLockElement) document.exitPointerLock()
  gameRoom.send('exit_apartment')
}

function toggleEditor() {
  if (currentRoomLabel.value !== 'apartment') return
  const next = !editorEnabled.value
  if (next && document.pointerLockElement) {
    document.exitPointerLock()
  }
  setEditorEnabled(next)
  if (transformControls) {
    if (transformControlsHelper) transformControlsHelper.visible = editorEnabled.value
    if (!transformControls.object) {
      const mesh = apartmentObjects.get(APARTMENT_TEST_OBJECT_ID)
      if (mesh) transformControls.attach(mesh)
    }
  }
}

function setTransformMode(mode: 'translate' | 'rotate') {
  transformMode.value = mode
  if (!transformControls) return
  transformControls.setMode(mode)
}

async function tryExitApartmentAtDoor() {
  if (!nearApartmentDoor.value) return
  await backToCity()
}

function tryEnterApartmentAtDoor() {
  if (!nearCityDoor.value) return
  void enterMyApartment()
}

function onVisibilityOrFocus() {
  if (document.visibilityState !== 'visible') return
  refreshMyAppearance?.()
}

function onBeforeUnload() {
  void gameRoom?.leave()
}

function onPointerLockChange() {
  pointerLocked.value = document.pointerLockElement === canvasRef.value
  if (fpHands) {
    fpHands.visible = pointerLocked.value
  }
  if (transformControls) {
    transformControls.enabled = !pointerLocked.value && editorEnabled.value
  }
}

function requestPointerLock() {
  canvasRef.value?.requestPointerLock()
}

function onResize() {
  if (!camera || !renderer) return
  const { w, h } = containerSize()
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.code === 'KeyE') {
    if (currentRoomLabel.value === 'apartment' && nearApartmentDoor.value) {
      void tryExitApartmentAtDoor()
      return
    }
    if (currentRoomLabel.value === 'city' && nearCityDoor.value) {
      tryEnterApartmentAtDoor()
      return
    }
  }
  switch (e.code) {
    case 'KeyW':
    case 'KeyZ':
      keys.forward = true
      break
    case 'KeyS':
      keys.back = true
      break
    case 'KeyA':
    case 'KeyQ':
      keys.left = true
      break
    case 'KeyD':
      keys.right = true
      break
  }
}

function onKeyUp(e: KeyboardEvent) {
  switch (e.code) {
    case 'KeyW':
    case 'KeyZ':
      keys.forward = false
      break
    case 'KeyS':
      keys.back = false
      break
    case 'KeyA':
    case 'KeyQ':
      keys.left = false
      break
    case 'KeyD':
      keys.right = false
      break
  }
}

let mouseX = 0
let mouseY = 0
let yaw = 0
let pitch = 0

function onMouseMove(e: MouseEvent) {
  if (!pointerLocked.value) return
  mouseX = e.movementX
  mouseY = e.movementY
}

function updateMovement(dt: number) {
  const forward = keys.forward ? 1 : keys.back ? -1 : 0
  const right = keys.right ? 1 : keys.left ? -1 : 0
  yaw -= mouseX * 0.002
  pitch -= mouseY * 0.002
  pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch))
  mouseX = 0
  mouseY = 0
  direction.set(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
  const rightVec = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize()
  velocity.set(0, 0, 0)
  if (forward) velocity.add(direction.clone().multiplyScalar(forward * moveSpeed * dt))
  if (right) velocity.add(rightVec.clone().multiplyScalar(right * moveSpeed * dt))
  myPosition.x += velocity.x
  myPosition.y = 1.6
  myPosition.z += velocity.z
  if (currentRoomLabel.value === 'apartment') {
    clampMyPositionToApartment()
    const dx = myPosition.x - APARTMENT_DOOR_POS.x
    const dz = myPosition.z - APARTMENT_DOOR_POS.z
    nearApartmentDoor.value = (dx * dx + dz * dz) <= APARTMENT_DOOR_RADIUS * APARTMENT_DOOR_RADIUS
    nearCityDoor.value = false
  } else {
    nearApartmentDoor.value = false
    const dx = myPosition.x - CITY_BUILDING_DOOR_POS.x
    const dz = myPosition.z - CITY_BUILDING_DOOR_POS.z
    nearCityDoor.value = (dx * dx + dz * dz) <= CITY_BUILDING_DOOR_RADIUS * CITY_BUILDING_DOOR_RADIUS
  }
  camera.position.set(myPosition.x, myPosition.y, myPosition.z)
  camera.rotation.order = 'YXZ'
  camera.rotation.y = yaw
  camera.rotation.x = pitch
  const now = Date.now()
  if (gameRoom && now - lastEmit > emitInterval) {
    lastEmit = now
    gameRoom.send('move', { x: myPosition.x, y: myPosition.y, z: myPosition.z })
  }
}

let frameId = 0
let lastTime = performance.now()

function animate() {
  frameId = requestAnimationFrame(animate)
  const now = performance.now()
  const dt = (now - lastTime) / 1000
  lastTime = now
  if (pointerLocked.value) updateMovement(dt)
  renderer?.render(scene, camera)
}

function logout() {
  clearAuth()
  void gameRoom?.leave()
  router.push({ name: 'landing' })
}

async function getCosmeticsState(): Promise<CharacterCosmeticsState> {
  try {
    return await fetchCharacterCosmetics()
  } catch {
    return {
      slots: emptyCosmeticLoadout(),
      colors: defaultCosmeticColors(),
    }
  }
}

async function bootGame() {
  const auth = getStoredAuth()
  if (!auth) {
    router.push({ name: 'landing' })
    return
  }
  const state = await getCosmeticsState()
  const bodyTint = hexStringToNumber(state.colors.body)
  initThree(bodyTint)
  await connectRealtime(state)
  animate()
}

onMounted(() => {
  void bootGame()
  window.addEventListener('resize', onResize)
  window.addEventListener('focus', onVisibilityOrFocus)
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('pagehide', onBeforeUnload)
  document.addEventListener('visibilitychange', onVisibilityOrFocus)
  document.addEventListener('pointerlockchange', onPointerLockChange)
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('keyup', onKeyUp)
  document.addEventListener('mousemove', onMouseMove)
})

onUnmounted(() => {
  cancelAnimationFrame(frameId)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('focus', onVisibilityOrFocus)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('pagehide', onBeforeUnload)
  document.removeEventListener('visibilitychange', onVisibilityOrFocus)
  document.removeEventListener('pointerlockchange', onPointerLockChange)
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('mousemove', onMouseMove)
  refreshMyAppearance = null
  void gameRoom?.leave()
  if (persistTransformTimer) {
    clearTimeout(persistTransformTimer)
    persistTransformTimer = null
  }
  clearRemoteUsers()
  clearApartmentObjects()
  if (roomEnvironment) {
    scene.remove(roomEnvironment)
    disposeObject3D(roomEnvironment)
    roomEnvironment = null
  }
  if (transformControls) {
    transformControls.dispose()
    transformControls = null
  }
  if (transformControlsHelper) {
    scene.remove(transformControlsHelper)
    disposeObject3D(transformControlsHelper)
    transformControlsHelper = null
  }
  if (fpHands) {
    camera.remove(fpHands)
    disposeObject3D(fpHands)
    fpHands = null
  }
  renderer?.dispose()
})
</script>

<template>
  <div ref="containerRef" class="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
    <canvas ref="canvasRef" class="block min-h-0 w-full flex-1 cursor-crosshair" @click="requestPointerLock" />
    <div
      v-if="roomMessage"
      class="pointer-events-auto absolute left-1/2 top-4 z-10 max-w-md -translate-x-1/2 rounded-lg border border-amber-400/50 bg-amber-950/90 px-4 py-2 text-center text-sm text-amber-100"
      role="status"
    >
      {{ roomMessage }}
    </div>
    <div class="pointer-events-auto absolute left-3 top-3 z-10 flex items-center gap-2">
      <span class="rounded-md border border-white/25 bg-black/45 px-2 py-1 text-xs text-white/90">
        Room: {{ currentRoomLabel }}
      </span>
      <span
        v-if="currentRoomLabel === 'apartment'"
        class="rounded-md border border-white/25 bg-black/45 px-2 py-1 text-xs text-white/90"
      >
        Objects: {{ apartmentObjectCount }}
      </span>
      <button
        v-if="currentRoomLabel === 'apartment'"
        type="button"
        class="rounded-md border border-white/30 bg-black/40 px-2 py-1 text-xs text-white/90 hover:border-campus-accent hover:text-campus-accent"
        @click="toggleEditor"
      >
        {{ editorEnabled ? 'Disable editor' : 'Enable editor' }}
      </button>
      <button
        v-if="currentRoomLabel === 'apartment' && editorEnabled"
        type="button"
        class="rounded-md border border-white/30 bg-black/40 px-2 py-1 text-xs text-white/90 hover:border-campus-accent hover:text-campus-accent"
        @click="setTransformMode('translate')"
      >
        Move
      </button>
      <button
        v-if="currentRoomLabel === 'apartment' && editorEnabled"
        type="button"
        class="rounded-md border border-white/30 bg-black/40 px-2 py-1 text-xs text-white/90 hover:border-campus-accent hover:text-campus-accent"
        @click="setTransformMode('rotate')"
      >
        Rotate
      </button>
    </div>
    <div
      v-show="!pointerLocked && !editorEnabled"
      class="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60"
    >
      <p class="m-0 text-base text-white/80">Click to lock pointer · ZQSD / WASD to move · Mouse to look</p>
      <button
        type="button"
        class="rounded-lg border-0 bg-campus-accent px-8 py-3 text-lg font-semibold text-white hover:opacity-90"
        @click="requestPointerLock"
      >
        Play
      </button>
      <button
        type="button"
        class="rounded-md border border-white/30 bg-transparent px-4 py-2 text-sm text-white/90 hover:border-campus-accent hover:text-campus-accent"
        @click="logout"
      >
        Logout
      </button>
    </div>
    <div v-show="pointerLocked" class="absolute right-3 top-3">
      <button
        type="button"
        class="rounded-md border border-white/30 bg-transparent px-3 py-1.5 text-xs text-white/90 hover:border-campus-accent hover:text-campus-accent"
        @click="logout"
      >
        Logout
      </button>
    </div>
    <div
      v-if="currentRoomLabel === 'apartment' && nearApartmentDoor"
      class="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-white/30 bg-black/50 px-3 py-2 text-xs text-white/95"
    >
      Press E near the door to exit apartment
    </div>
    <div
      v-if="currentRoomLabel === 'city' && nearCityDoor"
      class="pointer-events-none absolute bottom-5 left-1/2 z-10 -translate-x-1/2 rounded-lg border border-white/30 bg-black/50 px-3 py-2 text-xs text-white/95"
    >
      Press E near the building door to enter apartment
    </div>
  </div>
</template>
