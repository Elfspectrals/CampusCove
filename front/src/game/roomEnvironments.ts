import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import {
  APARTMENT_DOOR_POS,
  APARTMENT_HALF_EXTENT,
  APARTMENT_ROOM_HEIGHT,
  APARTMENT_WALL_THICKNESS,
  CITY_BUILDING_DOOR_POS,
} from './gameRoomConstants'
import { createGltfLoader } from './gltfLoaderFactory'
import { getGraphicsQuality, usesLowDetailRoomAssets } from './graphicsQuality'
import {
  addApartmentFallbackLights,
  configureRoomMeshShadows,
  normalizeRoomMaterials,
  sanitizeGltfLights,
} from './sceneLighting'

const CITY_SKY_COLOR = 0x9fc3e8

function lobbyMapPathForQuality(): string {
  return usesLowDetailRoomAssets() ? '/maps/LobbyMap.low.glb' : '/maps/LobbyMap.glb'
}

function apartmentMapPathForQuality(): string {
  return usesLowDetailRoomAssets() ? '/maps/ApartmentInterior.low.glb' : '/maps/ApartmentInterior.glb'
}

function addLobbyLighting(group: THREE.Group): void {
  if (getGraphicsQuality() === 'low') {
    const hemi = new THREE.HemisphereLight(0xe8e4df, 0x8a8278, 0.3)
    group.add(hemi)
    return
  }
  const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x8a7f70, 0.35)
  group.add(hemi)
}

let cachedLobbyEnvironment: THREE.Group | null = null
let lobbyEnvironmentLoadPromise: Promise<THREE.Group> | null = null

function prepareLobbyGroup(root: THREE.Group): THREE.Group {
  sanitizeGltfLights(root)
  configureRoomMeshShadows(root)
  normalizeRoomMaterials(root, 'city')
  addLobbyLighting(root)
  root.userData.isRoomEnvironment = true
  root.userData.isPersistentEnvironment = true
  return root
}

/** Loads LobbyMap.glb once; subsequent calls reuse the cached group (never disposed). */
export function loadLobbyEnvironment(): Promise<THREE.Group> {
  if (cachedLobbyEnvironment) {
    return Promise.resolve(cachedLobbyEnvironment)
  }
  if (!lobbyEnvironmentLoadPromise) {
    lobbyEnvironmentLoadPromise = new Promise<THREE.Group>((resolve, reject) => {
      const dracoLoader = new DRACOLoader()
      dracoLoader.setDecoderPath('/draco-decoder/')
      const loader = new GLTFLoader()
      loader.setDRACOLoader(dracoLoader)
      loader.load(
        lobbyMapPathForQuality(),
        (gltf) => {
          const group = prepareLobbyGroup(gltf.scene)
          cachedLobbyEnvironment = group
          resolve(group)
        },
        undefined,
        (error) => {
          lobbyEnvironmentLoadPromise = null
          reject(error)
        },
      )
    })
  }
  return lobbyEnvironmentLoadPromise
}

export function applySceneAtmosphere(
  scene: THREE.Scene,
  kind: 'city' | 'apartment',
  renderer?: THREE.WebGLRenderer,
): void {
  if (kind === 'city') {
    scene.background = new THREE.Color(CITY_SKY_COLOR)
    const fogFar = getGraphicsQuality() === 'low' ? 120 : 250
    scene.fog = new THREE.Fog(CITY_SKY_COLOR, 30, fogFar)
    if (renderer) {
      renderer.toneMappingExposure = 1.05
    }
  } else {
    scene.background = new THREE.Color(0x1a1816)
    scene.fog = new THREE.Fog(0x1a1816, 28, 95)
    if (renderer) {
      renderer.toneMappingExposure = 1.1
    }
  }
}

export function buildCityEnvironment(): THREE.Group {
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
    new THREE.MeshStandardMaterial({ color: 0x34455f }),
  )
  buildingBody.position.set(CITY_BUILDING_DOOR_POS.x, 2, CITY_BUILDING_DOOR_POS.z + 2.6)
  buildingBody.castShadow = true
  buildingBody.receiveShadow = true
  g.add(buildingBody)
  const buildingDoor = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 2.2, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x2a1f1a }),
  )
  buildingDoor.position.set(CITY_BUILDING_DOOR_POS.x, 1.1, CITY_BUILDING_DOOR_POS.z)
  buildingDoor.castShadow = true
  buildingDoor.receiveShadow = true
  g.add(buildingDoor)
  return g
}

/** Result from apartment environment builders for scene + placement raycast/collider registration. */
export interface ApartmentEnvironmentBuildResult {
  group: THREE.Group
}

function addApartmentLighting(group: THREE.Group): void {
  if (getGraphicsQuality() === 'low') {
    const hemi = new THREE.HemisphereLight(0xf0ebe4, 0x6b5344, 0.22)
    group.add(hemi)
    return
  }
  const hemi = new THREE.HemisphereLight(0xfff5e6, 0x6b5344, 0.25)
  group.add(hemi)
}

function tagApartmentFloor(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (/House_Floor/i.test(obj.name)) {
      obj.userData.apartmentEnvPart = 'floor'
    }
  })
}

function addApartmentExitDoor(group: THREE.Group): void {
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 2.2, 0.1),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  door.position.set(APARTMENT_DOOR_POS.x, 1.1, APARTMENT_DOOR_POS.z)
  door.userData.isApartmentDoor = true
  group.add(door)
}

function prepareApartmentGroup(root: THREE.Group): ApartmentEnvironmentBuildResult {
  const hasGltfLights = sanitizeGltfLights(root)
  configureRoomMeshShadows(root)
  normalizeRoomMaterials(root, 'apartment')
  tagApartmentFloor(root)
  addApartmentExitDoor(root)
  addApartmentLighting(root)
  if (!hasGltfLights) {
    addApartmentFallbackLights(root)
  }
  root.userData.isRoomEnvironment = true
  root.userData.isPersistentEnvironment = true
  return { group: root }
}

let cachedApartmentEnvironment: THREE.Group | null = null
let apartmentEnvironmentLoadPromise: Promise<ApartmentEnvironmentBuildResult> | null = null

/** Loads ApartmentInterior.glb once; subsequent calls reuse the cached group (never disposed). */
export function loadApartmentEnvironment(): Promise<ApartmentEnvironmentBuildResult> {
  if (cachedApartmentEnvironment) {
    return Promise.resolve({ group: cachedApartmentEnvironment })
  }
  if (!apartmentEnvironmentLoadPromise) {
    apartmentEnvironmentLoadPromise = new Promise<ApartmentEnvironmentBuildResult>((resolve, reject) => {
      const loader = createGltfLoader()
      loader.load(
        apartmentMapPathForQuality(),
        (gltf) => {
          const built = prepareApartmentGroup(gltf.scene)
          cachedApartmentEnvironment = built.group
          resolve(built)
        },
        undefined,
        (error) => {
          apartmentEnvironmentLoadPromise = null
          reject(error)
        },
      )
    })
  }
  return apartmentEnvironmentLoadPromise
}

/** Procedural fallback when the GLB is unavailable (unused after `loadApartmentEnvironment` wiring). */
export function buildApartmentEnvironment(): ApartmentEnvironmentBuildResult {
  const g = new THREE.Group()
  g.userData.isRoomEnvironment = true
  const w = APARTMENT_HALF_EXTENT * 2
  const h = APARTMENT_ROOM_HEIGHT
  const t = APARTMENT_WALL_THICKNESS
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x6b5344 })
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc4b8a8 })
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x9a8f82 })
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, t, w), floorMat)
  floor.position.y = -t / 2
  floor.receiveShadow = true
  floor.userData.apartmentEnvPart = 'floor'
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
    new THREE.MeshStandardMaterial({ color: 0x3a2f2a }),
  )
  door.position.set(APARTMENT_DOOR_POS.x, 1.1, APARTMENT_DOOR_POS.z)
  door.userData.isApartmentDoor = true
  g.add(door)
  return { group: g }
}
