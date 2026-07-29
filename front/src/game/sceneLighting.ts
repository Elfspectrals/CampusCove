import * as THREE from 'three'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import {
  supportsEnvironmentMap,
  supportsPointLightShadows,
  supportsRoomMeshShadows,
} from './graphicsQuality'
import type { GraphicsSettings } from './gameSettings'

/** CC0 — Kloppenheim 06 by Poly Haven (https://polyhaven.com/a/kloppenheim_06) */
export const SHARED_HDRI_PATH = '/env/kloppenheim_06_1k.hdr'

const MAX_GLB_LIGHT_INTENSITY = 50
const MIN_GLB_LIGHT_INTENSITY = 0.001

const ENV_MAP_INTENSITY: Record<'city' | 'apartment', number> = {
  city: 0.92,
  apartment: 0.45,
}

let cachedEnvMap: THREE.Texture | null = null
let envLoadPromise: Promise<THREE.Texture> | null = null
let cancelPendingEnvironmentLoad: (() => void) | null = null

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
    const generator = new THREE.PMREMGenerator(renderer)
    let cancelled = false
    let settled = false
    generator.compileEquirectangularShader()
    cancelPendingEnvironmentLoad = () => {
      if (settled) return
      cancelled = true
      settled = true
      generator.dispose()
      reject(new Error('Environment map load was cancelled'))
    }

    new RGBELoader().load(
      SHARED_HDRI_PATH,
      (texture) => {
        if (cancelled) {
          texture.dispose()
          return
        }
        try {
          texture.mapping = THREE.EquirectangularReflectionMapping
          const envMap = generator.fromEquirectangular(texture).texture
          cachedEnvMap = envMap
          settled = true
          cancelPendingEnvironmentLoad = null
          resolve(envMap)
        } catch (error) {
          envLoadPromise = null
          settled = true
          cancelPendingEnvironmentLoad = null
          reject(error)
        } finally {
          texture.dispose()
          generator.dispose()
        }
      },
      undefined,
      (error) => {
        if (cancelled) return
        envLoadPromise = null
        settled = true
        cancelPendingEnvironmentLoad = null
        generator.dispose()
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
  cancelPendingEnvironmentLoad?.()
  cancelPendingEnvironmentLoad = null
  cachedEnvMap?.dispose()
  cachedEnvMap = null
  envLoadPromise = null
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
    // Static room geometry is normally baked and can be extremely large. Dynamic
    // avatars and apartment props opt into casting at their creation sites.
    obj.castShadow = false
  })
}

export interface DirectionalShadowRig {
  readonly target: THREE.Object3D
  follow(position: Readonly<{ x: number; y: number; z: number }>): void
  dispose(): void
}

/**
 * Configures a compact directional-light shadow volume around the player instead of
 * Three's origin-centred default. Call `follow` from the normal simulation RAF.
 */
export function configureDirectionalShadowRig(
  scene: THREE.Scene,
  light: THREE.DirectionalLight,
  graphics: GraphicsSettings,
  room: 'city' | 'apartment',
): DirectionalShadowRig {
  const target = new THREE.Object3D()
  target.name = 'DirectionalShadowTarget'
  scene.add(target)
  light.target = target
  light.castShadow = graphics.shadows !== 'off'
  light.shadow.mapSize.set(
    graphics.preset === 'high' ? 1024 : 512,
    graphics.preset === 'high' ? 1024 : 512,
  )

  const extent = room === 'city' ? 24 : 14
  const shadowCamera = light.shadow.camera
  shadowCamera.left = -extent
  shadowCamera.right = extent
  shadowCamera.top = extent
  shadowCamera.bottom = -extent
  shadowCamera.near = 0.5
  shadowCamera.far = room === 'city' ? 90 : 55
  shadowCamera.updateProjectionMatrix()
  light.shadow.bias = -0.00015
  light.shadow.normalBias = 0.025

  const lightOffset = room === 'city'
    ? new THREE.Vector3(18, 34, 14)
    : new THREE.Vector3(10, 20, 8)
  const texelWorldSize = (extent * 2) / light.shadow.mapSize.width

  function follow(position: Readonly<{ x: number; y: number; z: number }>): void {
    const x = Math.round(position.x / texelWorldSize) * texelWorldSize
    const z = Math.round(position.z / texelWorldSize) * texelWorldSize
    target.position.set(x, Math.max(0, position.y - 1), z)
    light.position.set(x + lightOffset.x, target.position.y + lightOffset.y, z + lightOffset.z)
    target.updateMatrixWorld()
  }

  function dispose(): void {
    target.removeFromParent()
    if (light.target === target) {
      light.target = new THREE.Object3D()
    }
  }

  return { target, follow, dispose }
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
