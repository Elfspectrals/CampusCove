import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import {
  graphicsSettingsRequireReload,
  type GraphicsSettings,
} from './gameSettings'

export interface GameRendererOptions {
  canvas: HTMLCanvasElement
  width: number
  height: number
  graphics: GraphicsSettings
  devicePixelRatio?: number
}

export interface GameRendererStats {
  fps: number
  drawCalls: number
  triangles: number
  usingPostprocessing: boolean
}

export interface ApplyGraphicsResult {
  requiresReload: boolean
}

export interface GameRendererPipeline {
  readonly renderer: THREE.WebGLRenderer
  render(scene: THREE.Scene, camera: THREE.Camera): void
  resize(width: number, height: number): void
  applyLiveGraphicsSettings(graphics: GraphicsSettings): ApplyGraphicsResult
  getStats(): GameRendererStats
  dispose(): void
}

interface DisposablePass {
  dispose?: () => void
}

function nowMilliseconds(): number {
  return typeof performance === 'undefined' ? Date.now() : performance.now()
}

function disposePass(pass: DisposablePass | null): void {
  pass?.dispose?.()
}

export function effectiveRendererPixelRatio(
  graphics: GraphicsSettings,
  devicePixelRatio =
    typeof window === 'undefined' ? 1 : Math.max(0.5, window.devicePixelRatio || 1),
): number {
  return Math.max(
    0.5,
    Math.min(
      graphics.maxDevicePixelRatio,
      devicePixelRatio * graphics.resolutionScale,
    ),
  )
}

export function createGameRenderer(options: GameRendererOptions): GameRendererPipeline {
  let graphics = { ...options.graphics }
  let width = Math.max(1, options.width)
  let height = Math.max(1, options.height)
  const nativeDevicePixelRatio =
    options.devicePixelRatio ??
    (typeof window === 'undefined' ? 1 : Math.max(0.5, window.devicePixelRatio || 1))

  const renderer = new THREE.WebGLRenderer({
    canvas: options.canvas,
    antialias: graphics.antialias,
    powerPreference: 'high-performance',
  })
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = graphics.shadows !== 'off'
  renderer.shadowMap.type =
    graphics.shadows === 'soft' ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap

  let composer: EffectComposer | null = null
  let renderPass: RenderPass | null = null
  let bloomPass: UnrealBloomPass | null = null
  let outputPass: OutputPass | null = null
  let composerFailed = false
  let fpsWindowStartedAt = nowMilliseconds()
  let framesInWindow = 0
  let measuredFps = 0

  function disposeComposer(): void {
    disposePass(bloomPass)
    disposePass(outputPass)
    composer?.dispose()
    composer = null
    renderPass = null
    bloomPass = null
    outputPass = null
  }

  function createComposer(): void {
    if (graphics.postprocessing !== 'bloom' || composerFailed) return
    try {
      const target = new THREE.WebGLRenderTarget(1, 1, {
        depthBuffer: true,
        stencilBuffer: false,
      })
      target.samples = graphics.antialias ? 4 : 0
      composer = new EffectComposer(renderer, target)
      renderPass = new RenderPass(new THREE.Scene(), new THREE.Camera())
      bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.22,
        0.28,
        0.88,
      )
      outputPass = new OutputPass()
      composer.addPass(renderPass)
      composer.addPass(bloomPass)
      composer.addPass(outputPass)
    } catch (error) {
      composerFailed = true
      disposeComposer()
      console.warn('[game-renderer] Postprocessing unavailable; using direct rendering.', error)
    }
  }

  function resize(nextWidth: number, nextHeight: number): void {
    width = Math.max(1, nextWidth)
    height = Math.max(1, nextHeight)
    const pixelRatio = effectiveRendererPixelRatio(graphics, nativeDevicePixelRatio)
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height, false)
    composer?.setPixelRatio(pixelRatio)
    composer?.setSize(width, height)
    bloomPass?.resolution.set(width * pixelRatio, height * pixelRatio)
  }

  function recordRenderedFrame(): void {
    framesInWindow += 1
    const now = nowMilliseconds()
    const elapsed = now - fpsWindowStartedAt
    if (elapsed < 500) return
    measuredFps = (framesInWindow * 1000) / elapsed
    framesInWindow = 0
    fpsWindowStartedAt = now
  }

  function render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (composer && renderPass) {
      renderPass.scene = scene
      renderPass.camera = camera
      try {
        composer.render()
      } catch (error) {
        composerFailed = true
        disposeComposer()
        console.warn('[game-renderer] Postprocessing failed; continuing with direct rendering.', error)
        renderer.render(scene, camera)
      }
    } else {
      renderer.render(scene, camera)
    }
    recordRenderedFrame()
  }

  function applyLiveGraphicsSettings(next: GraphicsSettings): ApplyGraphicsResult {
    const requiresReload = graphicsSettingsRequireReload(graphics, next)
    graphics = { ...next }
    renderer.shadowMap.enabled = graphics.shadows !== 'off'
    renderer.shadowMap.type =
      graphics.shadows === 'soft' ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap
    resize(width, height)
    return { requiresReload }
  }

  function getStats(): GameRendererStats {
    return {
      fps: measuredFps,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      usingPostprocessing: composer !== null,
    }
  }

  function dispose(): void {
    disposeComposer()
    renderer.dispose()
  }

  createComposer()
  resize(width, height)

  return {
    renderer,
    render,
    resize,
    applyLiveGraphicsSettings,
    getStats,
    dispose,
  }
}
