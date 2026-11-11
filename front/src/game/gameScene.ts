/** Renderer, camera and global lights of the /game view, configured for the current graphics quality. */
import * as THREE from 'three'
import { disposeObject3D } from '../avatar/compositeAvatar'
import { HOUSING_LOBBY_SPAWN } from './gameRoomConstants'
import { comfortSettings } from '../composables/game/useComfortSettings'
import { verticalFovFor } from './comfort'
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
  /** Holds the first-person arms (firstPersonArms.ts), shown while the pointer is locked. */
  fpHands: THREE.Group
  /** The arms are drawn by their own camera over the world (renderGameFrame), so the world FOV never stretches them. */
  viewScene: THREE.Scene
  viewCamera: THREE.PerspectiveCamera
}

/**
 * Viewmodel camera: a fixed, narrow FOV for the arms whatever the player's FOV setting (a wide world FOV stretched the
 * hands at the screen edges). The arms sit a little further forward to stay well inside this narrower frame.
 */
const VIEWMODEL_FOV = 62
const VIEWMODEL_PUSH = -0.06

export function createGameScene(
  canvas: HTMLCanvasElement,
  size: { w: number; h: number },
): GameScene {
  const isLowQuality = getGraphicsQuality() === 'low'

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(verticalFovFor(comfortSettings.fov, size.w / size.h), size.w / size.h, 0.1, isLowQuality ? 300 : 1000)
  camera.position.set(HOUSING_LOBBY_SPAWN.x, HOUSING_LOBBY_SPAWN.y, HOUSING_LOBBY_SPAWN.z)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isLowQuality })
  renderer.setSize(size.w, size.h)
  renderer.setPixelRatio(isLowQuality ? 1 : Math.min(window.devicePixelRatio, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = !isLowQuality
  if (!isLowQuality) renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05

  applySceneAtmosphere(scene, renderer)

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

  const fpHands = new THREE.Group()
  fpHands.name = 'FirstPersonArms'
  fpHands.visible = false
  fpHands.position.z = VIEWMODEL_PUSH
  scene.add(camera)

  const viewScene = new THREE.Scene()
  const viewCamera = new THREE.PerspectiveCamera(VIEWMODEL_FOV, size.w / size.h, 0.01, 5)
  viewCamera.add(fpHands)
  viewScene.add(viewCamera)
  // a steady key light from above and in front, so the hands read the same in every room
  viewScene.add(new THREE.HemisphereLight(0xfff6ec, 0x6e6258, 1.6))
  const viewKey = new THREE.DirectionalLight(0xffffff, 1.3)
  viewKey.position.set(-0.6, 1.2, 0.8)
  viewScene.add(viewKey)

  return { scene, camera, renderer, fpHands, viewScene, viewCamera }
}

/** World first, then the arms on a cleared depth buffer: they never clip into walls and keep their own FOV. */
export function renderGameFrame(game: Pick<GameScene, 'scene' | 'camera' | 'renderer' | 'fpHands' | 'viewScene' | 'viewCamera'>): void {
  const { renderer } = game
  renderer.render(game.scene, game.camera)
  if (!game.fpHands.visible) return
  game.viewScene.environment = game.scene.environment
  const autoClear = renderer.autoClear
  renderer.autoClear = false
  renderer.clearDepth()
  renderer.render(game.viewScene, game.viewCamera)
  renderer.autoClear = autoClear
}

export function resizeViewmodel(game: Pick<GameScene, 'viewCamera'>, w: number, h: number): void {
  game.viewCamera.aspect = w / h
  game.viewCamera.updateProjectionMatrix()
}

export function disposeGameScene(game: GameScene): void {
  game.viewCamera.remove(game.fpHands)
  disposeObject3D(game.fpHands)
  disposeSharedEnvironment()
  game.renderer.dispose()
}
