import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import {
  supportsEnvironmentMap,
  supportsPointLightShadows,
  supportsRoomMeshShadows,
} from './graphicsQuality'

/** CC0 — Kloppenheim 06 by Poly Haven (https://polyhaven.com/a/kloppenheim_06) */
export const SHARED_HDRI_PATH = '/env/kloppenheim_06_1k.hdr'

const MAX_GLB_LIGHT_INTENSITY = 50
const MIN_GLB_LIGHT_INTENSITY = 0.001
const SHADOW_CAST_MIN_MESH_DIM = 0.25

const ENV_MAP_INTENSITY: Record<'city' | 'apartment', number> = {
  city: 0.92,
  apartment: 0.45,
}

let cachedEnvMap: THREE.Texture | null = null
let envLoadPromise: Promise<THREE.Texture> | null = null
let pmremGenerator: THREE.PMREMGenerator | null = null

export async function loadSharedEnvironmentMap(renderer: THREE.WebGLRenderer): Promise<THREE.Texture> {
  if (!supportsEnvironmentMap()) {
    throw new Error('Environment map is disabled for current graphics quality')
  }
  if (cachedEnvMap) {
    return cachedEnvMap
  }
  if (envLoadPromise) {
    return envLoadPromise
  }

  envLoadPromise = new Promise<THREE.Texture>((resolve, reject) => {
    pmremGenerator = new THREE.PMREMGenerator(renderer)
    pmremGenerator.compileEquirectangularShader()

    new RGBELoader().load(
      SHARED_HDRI_PATH,
      (texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping
        const envMap = pmremGenerator!.fromEquirectangular(texture).texture
        texture.dispose()
        cachedEnvMap = envMap
        resolve(envMap)
      },
      undefined,
      (error) => {
        envLoadPromise = null
        reject(error)
      },
    )
  })

  return envLoadPromise
}

export function applySharedEnvironment(scene: THREE.Scene, envMap: THREE.Texture): void {
  scene.environment = envMap
}

export function clearSharedEnvironment(scene: THREE.Scene): void {
  scene.environment = null
}

export function disposeSharedEnvironment(): void {
  cachedEnvMap?.dispose()
  cachedEnvMap = null
  envLoadPromise = null
  pmremGenerator?.dispose()
  pmremGenerator = null
}

export function normalizeRoomMaterials(root: THREE.Object3D, kind: 'city' | 'apartment'): void {
  const hasEnvMap = supportsEnvironmentMap()
  const envIntensity = hasEnvMap ? ENV_MAP_INTENSITY[kind] : 0

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) {
      return
    }
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const material of materials) {
      if (
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshPhysicalMaterial
      ) {
        if (hasEnvMap) {
          material.envMapIntensity = envIntensity
        }
        if (material.roughness >= 1 && material.metalness <= 0) {
          material.roughness = Math.min(material.roughness, 0.92)
        }
      }
    }
  })
}

export function sanitizeGltfLights(root: THREE.Object3D): boolean {
  const toRemove: THREE.Object3D[] = []
  let hasUsableLight = false
  const pointShadows = supportsPointLightShadows()

  root.traverse((obj) => {
    if (obj instanceof THREE.Camera) {
      toRemove.push(obj)
      return
    }
    if (!(obj instanceof THREE.Light)) {
      return
    }

    if (obj.intensity > MAX_GLB_LIGHT_INTENSITY || obj.intensity < MIN_GLB_LIGHT_INTENSITY) {
      toRemove.push(obj)
      return
    }

    hasUsableLight = true

    if (obj instanceof THREE.PointLight || obj instanceof THREE.SpotLight) {
      obj.castShadow = pointShadows
      if (pointShadows) {
        obj.shadow.mapSize.set(512, 512)
      }
    }
  })

  for (const obj of toRemove) {
    obj.removeFromParent()
  }

  return hasUsableLight
}

export function configureRoomMeshShadows(root: THREE.Object3D): void {
  const enabled = supportsRoomMeshShadows()
  const box = new THREE.Box3()
  const size = new THREE.Vector3()

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) {
      return
    }
    if (!enabled) {
      obj.castShadow = false
      obj.receiveShadow = false
      return
    }

    obj.receiveShadow = true
    box.setFromObject(obj)
    box.getSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    obj.castShadow = maxDim >= SHADOW_CAST_MIN_MESH_DIM
  })
}

export function addApartmentFallbackLights(group: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(group)
  const center = box.getCenter(new THREE.Vector3())
  const roomSize = box.getSize(new THREE.Vector3())

  const warmKey = new THREE.PointLight(0xffd4a8, 10, 16, 2)
  warmKey.position.set(center.x + roomSize.x * 0.06, 2.35, center.z + roomSize.z * 0.04)
  group.add(warmKey)

  const windowFill = new THREE.PointLight(0xe8eef5, 4.5, 20, 2)
  windowFill.position.set(center.x - roomSize.x * 0.22, 2.05, center.z - roomSize.z * 0.18)
  group.add(windowFill)

  const ceilingFill = new THREE.PointLight(0xfff5eb, 2, 22, 2)
  ceilingFill.position.set(center.x, 2.85, center.z)
  group.add(ceilingFill)
}

export function configureGlobalSceneLights(
  ambient: THREE.AmbientLight,
  directional: THREE.DirectionalLight,
): void {
  ambient.intensity = 0.15
  ambient.color.setHex(0xb0a89e)
  directional.intensity = 1.0
}
