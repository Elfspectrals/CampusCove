import * as THREE from 'three'
import type { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { COVE_HOME, findHouse, findWork } from './assets/catalog'
import { createGltfLoader } from './gltfLoaderFactory'
import { getGraphicsQuality } from './graphicsQuality'
import { shareTexturesAcrossModels } from './sharedTextures'
import { applyInteriorLightmap, openHouseLots, openStoreLots, openWorkLots, placeOpenHouseInterior, registerFrontDoor } from './town/openHouses'
import { animatePondWater } from './town/pondWater'
import { setTerrainHeightmap, type TerrainHeightmap } from './town/terrainHeight'
import { fetchWorldManifest, houseBuildings, storeBuildings, workBuildings, type WorldManifest, type WorldZone } from './world/worldManifest'
import {
  configureRoomMeshShadows,
  normalizeRoomMaterials,
  sanitizeGltfLights,
} from './sceneLighting'

const CITY_SKY_COLOR = 0x9fc3e8

async function loadModelSharingTextures(loader: GLTFLoader, url: string): Promise<GLTF> {
  const gltf = await loader.loadAsync(url)
  await shareTexturesAcrossModels(gltf)
  return gltf
}

function addTownLighting(group: THREE.Group): void {
  if (getGraphicsQuality() === 'low') {
    group.add(new THREE.HemisphereLight(0xe8e4df, 0x8a8278, 0.3))
    return
  }
  group.add(new THREE.HemisphereLight(0xcfe5ff, 0x8a7f70, 0.35))
}

// ---------------------------------------------------------------- town (/game city)

export interface TownEnvironmentBuildResult {
  group: THREE.Group
  manifest: WorldManifest
}

let cachedTown: TownEnvironmentBuildResult | null = null
let townLoadPromise: Promise<TownEnvironmentBuildResult> | null = null

async function fetchHeightmap(url: string): Promise<TerrainHeightmap> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load the heightmap ${url} (${res.status})`)
  return ((await res.json()) as { heightmap: TerrainHeightmap }).heightmap
}

async function loadZoneScenery(loader: GLTFLoader, zone: WorldZone): Promise<THREE.Group> {
  const [gltf, heightmap] = await Promise.all([
    loader.loadAsync(zone.modelUrl),
    zone.heightmapUrl ? fetchHeightmap(zone.heightmapUrl) : null,
  ])
  if (heightmap) setTerrainHeightmap(heightmap)
  const scenery = gltf.scene
  scenery.name = `Zone_${zone.key}`
  if (zone.animatedWater && animatePondWater(scenery) === 0) {
    console.warn(`[world] ${zone.key} water material not found, water stays static`)
  }
  return scenery
}

/**
 * Loads the world once from world.manifest.json: every zone's scenery, then the house and work building
 * exteriors (and the house interiors placed in the world) listed in the zones. Collision is composed
 * separately (town/openHouses buildTownCollisionData). The group is cached, never disposed.
 */
export function loadTownEnvironment(): Promise<TownEnvironmentBuildResult> {
  if (cachedTown) return Promise.resolve(cachedTown)
  if (!townLoadPromise) {
    townLoadPromise = (async () => {
      const loader = createGltfLoader()
      const manifest = await fetchWorldManifest()
      const root = new THREE.Group()
      root.name = 'CampusWorld'
      const sceneries = await Promise.all(manifest.zones.map((zone) =>
        loadZoneScenery(loader, zone).catch((error: unknown) => {
          if (!zone.optional) throw error
          console.warn('[world] optional zone failed to load', zone.key, error)
          return null
        }),
      ))
      for (const scenery of sceneries) {
        if (scenery) root.add(scenery)
      }
      // A missing house should not take the whole town down.
      const houses = await Promise.all(houseBuildings(manifest).map(async (lot) => {
        const house = findHouse(lot.key)
        if (!house) return null
        try {
          const gltf = await loadModelSharingTextures(loader, house.exteriorUrl)
          const exterior = gltf.scene
          exterior.name = `HouseExterior_${lot.key}`
          if (lot.interiorOffset) registerFrontDoor(exterior, lot.key)
          exterior.position.fromArray(lot.position)
          exterior.rotation.y = lot.rotationY
          exterior.userData.houseKey = lot.key
          return exterior
        } catch (error) {
          console.warn('[town] house exterior failed to load', lot.key, error)
          return null
        }
      }))
      for (const exterior of houses) {
        if (exterior) root.add(exterior)
      }
      const interiorSources = [
        ...openHouseLots(manifest).map((lot) => ({ lot, asset: findHouse(lot.key) })),
        ...openWorkLots(manifest).map((lot) => ({ lot, asset: findWork(lot.key) })),
        ...openStoreLots(manifest).map((lot) => ({ lot, asset: COVE_HOME })),
      ]
      const openInteriors = await Promise.all(interiorSources.map(async ({ lot, asset }) => {
        if (!asset) return null
        try {
          const [gltf, lightmap] = await Promise.all([
            loadModelSharingTextures(loader, asset.interiorUrl),
            new THREE.TextureLoader().loadAsync(asset.interiorLightmapUrl),
          ])
          applyInteriorLightmap(gltf.scene, lightmap)
          return placeOpenHouseInterior(gltf.scene, lot)
        } catch (error) {
          console.warn('[town] open house interior failed to load', lot.key, error)
          return null
        }
      }))
      for (const interior of openInteriors) {
        if (interior) root.add(interior)
      }
      const works = await Promise.all(workBuildings(manifest).map(async (lot) => {
        const asset = findWork(lot.key)
        if (!asset) return null
        try {
          const gltf = await loader.loadAsync(asset.exteriorUrl)
          const exterior = gltf.scene
          exterior.name = `WorkExterior_${lot.key}`
          if (lot.interiorOffset) registerFrontDoor(exterior, lot.key)
          exterior.position.fromArray(lot.position)
          exterior.rotation.y = lot.rotationY
          exterior.userData.workKey = lot.key
          return exterior
        } catch (error) {
          console.warn('[town] work exterior failed to load', lot.key, error)
          return null
        }
      }))
      for (const exterior of works) {
        if (exterior) root.add(exterior)
      }
      const stores = await Promise.all(storeBuildings(manifest).map(async (lot) => {
        try {
          const gltf = await loader.loadAsync(COVE_HOME.exteriorUrl)
          const exterior = gltf.scene
          exterior.name = `StoreExterior_${lot.key}`
          if (lot.interiorOffset) registerFrontDoor(exterior, lot.key)
          exterior.position.fromArray(lot.position)
          exterior.rotation.y = lot.rotationY
          return exterior
        } catch (error) {
          console.warn('[town] store exterior failed to load', lot.key, error)
          return null
        }
      }))
      for (const exterior of stores) {
        if (exterior) root.add(exterior)
      }
      sanitizeGltfLights(root)
      configureRoomMeshShadows(root)
      normalizeRoomMaterials(root, 'city')
      addTownLighting(root)
      root.userData.isRoomEnvironment = true
      root.userData.isPersistentEnvironment = true
      cachedTown = { group: root, manifest }
      return cachedTown
    })().catch((error) => {
      townLoadPromise = null
      throw error
    })
  }
  return townLoadPromise
}

export function applySceneAtmosphere(scene: THREE.Scene, renderer?: THREE.WebGLRenderer): void {
  scene.background = new THREE.Color(CITY_SKY_COLOR)
  const fogFar = getGraphicsQuality() === 'low' ? 120 : 250
  scene.fog = new THREE.Fog(CITY_SKY_COLOR, 30, fogFar)
  if (renderer) {
    renderer.toneMappingExposure = 1.05
  }
}

/** Remove any previous town / house roots left on the scene (HMR / route leftovers). */
export function stripRoomEnvironmentsFromScene(scene: THREE.Scene): void {
  const toRemove: THREE.Object3D[] = []
  for (const child of scene.children) {
    if (child.userData?.isRoomEnvironment === true || child.userData?.isPersistentEnvironment === true) {
      toRemove.push(child)
    }
  }
  for (const obj of toRemove) {
    scene.remove(obj)
    if (!obj.userData?.isPersistentEnvironment) {
      obj.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          node.geometry?.dispose()
          const mat = node.material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
          else mat?.dispose()
        }
      })
    }
  }
}

// ---------------------------------------------------------------- house interiors

/** What the interior loaders need from a house or work building. */
interface InteriorAsset {
  key: string
  interiorCollisionUrl: string
}

/** Result from apartment environment builders for scene + placement raycast/collider registration. */
export interface ApartmentEnvironmentBuildResult {
  group: THREE.Group
  /** House or work building whose interior this is (assets/houses/<key>/ or assets/work/<key>/). */
  house: InteriorAsset
}
