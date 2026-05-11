import * as THREE from 'three'
import {
  APARTMENT_DOOR_POS,
  APARTMENT_HALF_EXTENT,
  APARTMENT_ROOM_HEIGHT,
  APARTMENT_WALL_THICKNESS,
  CITY_BUILDING_DOOR_POS,
} from './gameRoomConstants'

export function applySceneAtmosphere(scene: THREE.Scene, kind: 'city' | 'apartment'): void {
  if (kind === 'city') {
    scene.background = new THREE.Color(0x1a1a2e)
    scene.fog = new THREE.Fog(0x1a1a2e, 10, 50)
  } else {
    scene.background = new THREE.Color(0x3a342f)
    scene.fog = new THREE.Fog(0x3a342f, 4, 22)
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

/** Result from `buildApartmentEnvironment` for scene + placement raycast/collider registration. */
export interface ApartmentEnvironmentBuildResult {
  group: THREE.Group
}

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
