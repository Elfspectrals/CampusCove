/** Renderer, camera and global lights of the /game view, configured for the current graphics quality. */
import * as THREE from 'three'
import { buildFirstPersonHands, disposeObject3D } from '../avatar/compositeAvatar'
import { HOUSING_LOBBY_SPAWN } from './gameRoomConstants'
import { getGraphicsQuality, supportsEnvironmentMap } from './graphicsQuality'
import { applySceneAtmosphere } from './roomEnvironments'
import {
  applySharedEnvironment,
  clearSharedEnvironment,
  configureGlobalSceneLights,
  disposeSharedEnvironment,
  loadSharedEnvironmentMap,
} from './sceneLighting'

export interface GameScene {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  /** First-person hands parented to the camera, shown while the pointer is locked. */
  fpHands: THREE.Group
}

export function createGameScene(
  canvas: HTMLCanvasElement,
  size: { w: number; h: number },
  /** Tint of the first-person hands (the player's body colour). */
  handsColor: number,
): GameScene {
  const isLowQuality = getGraphicsQuality() === 'low'

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(75, size.w / size.h, 0.1, isLowQuality ? 300 : 1000)
  camera.position.set(HOUSING_LOBBY_SPAWN.x, HOUSING_LOBBY_SPAWN.y, HOUSING_LOBBY_SPAWN.z)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isLowQuality })
  renderer.setSize(size.w, size.h)
  renderer.setPixelRatio(isLowQuality ? 1 : Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = !isLowQuality
  if (!isLowQuality) renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  applySceneAtmosphere(scene, 'city', renderer)

  const ambient = new THREE.AmbientLight(0xb0a89e, 0.15)
  scene.add(ambient)
  const sun = new THREE.DirectionalLight(0xffffff, 1.0)
  sun.position.set(10, 20, 10)
  if (!isLowQuality) {
    sun.castShadow = true
    sun.shadow.mapSize.set(1024, 1024)
  }
  scene.add(sun)
  configureGlobalSceneLights(ambient, sun)

  if (supportsEnvironmentMap()) {
    void loadSharedEnvironmentMap(renderer).then((envMap) => applySharedEnvironment(scene, envMap))
  } else {
    clearSharedEnvironment(scene)
  }

  const fpHands = buildFirstPersonHands(handsColor)
  fpHands.visible = false
  camera.add(fpHands)
  scene.add(camera)

  return { scene, camera, renderer, fpHands }
}

export function disposeGameScene(game: GameScene): void {
  game.camera.remove(game.fpHands)
  disposeObject3D(game.fpHands)
  disposeSharedEnvironment()
  game.renderer.dispose()
}
