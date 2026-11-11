import * as THREE from 'three'
import { SURVIVAL_WATCH_URL } from './assets/catalog'
import { createGltfLoader } from './gltfLoaderFactory'
import { GAUGE_COLORS, isLow, mostUrgentGauge, type GaugeKey, type SurvivalStats } from './survival'
import { fitWatchToForearm, type WatchFit } from './watchFit'

/**
 * The wrist watch on the first-person left arm: hunger and thirst live on its screen (health and stamina are the
 * 2D bars above the hotbar, GameVitals.vue). Its `Screen`
 * node gets a live canvas texture; the player raises the wrist (arms.raiseWatch) to read it. A low gauge blinks
 * and the whole watch buzzes from time to time, so it is noticed even with the arm down.
 * Model: map-src/CampusCove/build_watch.py (items/tools/watch).
 */

const CANVAS_W = 120
const CANVAS_H = 144
const REDRAW_S = 0.25
const BUZZ_EVERY_S = 6
const BUZZ_S = 0.5

const WATCH_GAUGES: readonly GaugeKey[] = ['thirst', 'hunger']

const ROWS: Array<{ key: GaugeKey; glyph: (ctx: CanvasRenderingContext2D, x: number, y: number) => void }> = [
  { key: 'hunger', glyph: drawDrumstick },
  { key: 'thirst', glyph: drawDrop },
]

function drawDrumstick(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath()
  ctx.ellipse(x - 2, y - 2, 7, 6, -0.6, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillRect(x + 2, y + 1, 7, 3)
  ctx.beginPath()
  ctx.arc(x + 10, y + 2.5, 2.5, 0, Math.PI * 2)
  ctx.fill()
}

function drawDrop(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath()
  ctx.moveTo(x, y - 9)
  ctx.quadraticCurveTo(x + 8, y + 1, x, y + 7)
  ctx.quadraticCurveTo(x - 8, y + 1, x, y - 9)
  ctx.fill()
}

function strapInnerHalf(model: THREE.Object3D): number {
  const value: unknown = model.getObjectByName('Watch')?.userData.strapInnerHalf
  if (typeof value !== 'number') throw new Error('[survivalWatch] the watch model has no strapInnerHalf extra')
  return value
}

function forearmVertices(forearm: THREE.Object3D): THREE.Vector3[] {
  const vertices: THREE.Vector3[] = []
  for (const child of forearm.children) {
    if (!(child instanceof THREE.Mesh)) continue
    child.updateMatrix()
    const positions = child.geometry.getAttribute('position')
    for (let i = 0; i < positions.count; i++) vertices.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(child.matrix))
  }
  return vertices
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.fill()
}

export function createSurvivalWatch() {
  const canvas = document.createElement('canvas')
  canvas.width = CANVAS_W
  canvas.height = CANVAS_H
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.flipY = false
  // drawn over the case top it sits on, whatever the mesh quantisation did to the gap
  const screenMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })

  let model: THREE.Object3D | null = null
  let innerHalf = 0
  let fit: WatchFit | null = null
  let hand: THREE.Object3D | null = null
  let stats: SurvivalStats | null = null
  let boostUntil = 0
  let time = 0
  let sinceDraw = REDRAW_S
  let sinceBuzz = 0

  void createGltfLoader()
    .loadAsync(SURVIVAL_WATCH_URL)
    .then((gltf) => {
      innerHalf = strapInnerHalf(gltf.scene)
      model = gltf.scene
      model.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.name === 'Screen') obj.material = screenMaterial
      })
      mount()
    })
    .catch((err: unknown) => console.error('[survivalWatch] load failed', err))

  function mount(): void {
    if (!model) return
    if (!hand) {
      model.removeFromParent()
      return
    }
    const forearm = hand.parent
    if (!forearm) throw new Error('[survivalWatch] the wrist has no forearm to strap the watch on')
    try {
      fit = fitWatchToForearm(forearmVertices(forearm), hand.position, innerHalf)
    } catch (err: unknown) {
      fit = null
      model.removeFromParent()
      console.error('[survivalWatch] cannot strap the watch on this forearm', err)
      return
    }
    if (model.parent !== forearm) forearm.add(model)
    model.position.copy(fit.position)
    model.quaternion.copy(fit.quaternion)
    model.scale.setScalar(fit.scale)
  }

  function draw(): void {
    ctx.fillStyle = '#1d1b26'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    if (!stats) {
      ctx.fillStyle = '#9f9bb0'
      ctx.font = 'bold 16px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('…', CANVAS_W / 2, CANVAS_H / 2)
      return
    }
    const blinkOff = Math.floor(time * 3) % 2 === 1
    ROWS.forEach(({ key, glyph }, i) => {
      const value = stats![key]
      const top = 16 + i * 56
      const low = isLow(value)
      const color = low && blinkOff ? '#5b566e' : GAUGE_COLORS[key]
      ctx.fillStyle = color
      glyph(ctx, 22, top + 11)
      ctx.fillStyle = '#f1efe8'
      ctx.font = 'bold 20px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(String(Math.round(value)), 108, top + 18)
      ctx.fillStyle = '#3a3648'
      roundRect(ctx, 12, top + 28, 96, 14, 7)
      ctx.fillStyle = color
      roundRect(ctx, 12, top + 28, Math.max(14, (96 * value) / 100), 14, 7)
    })
    if (Date.now() < boostUntil) {
      ctx.fillStyle = '#fac775'
      ctx.font = 'bold 14px sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`☕ ${Math.ceil((boostUntil - Date.now()) / 1000)}s`, CANVAS_W / 2, CANVAS_H - 10)
    }
  }

  function update(dt: number, nextHand: THREE.Object3D | null): void {
    time += dt
    if (nextHand !== hand) {
      hand = nextHand
      mount()
    }
    sinceDraw += dt
    if (sinceDraw >= REDRAW_S) {
      sinceDraw = 0
      draw()
      texture.needsUpdate = true
    }
    if (!model) return
    // buzz: a short shake when a gauge is low, so it is noticed with the arm down
    sinceBuzz += dt
    const urgent = stats ? mostUrgentGauge(stats, WATCH_GAUGES) : null
    if (sinceBuzz >= BUZZ_EVERY_S) sinceBuzz = urgent ? 0 : BUZZ_EVERY_S
    const buzzing = urgent !== null && sinceBuzz < BUZZ_S
    if (fit) model.position.copy(fit.position)
    if (buzzing) model.position.x += Math.sin(time * 90) * 0.0015
  }

  return {
    update,
    setStats: (next: SurvivalStats, nextBoostUntil: number) => {
      stats = next
      boostUntil = nextBoostUntil
      sinceDraw = REDRAW_S
    },
    dispose: () => {
      model?.removeFromParent()
      texture.dispose()
      screenMaterial.dispose()
    },
  }
}
